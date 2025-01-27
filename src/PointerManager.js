/**
 * Manages handles simultaneous events from a target. 
 * how do I write more substantial documentation.
 *
 * @param {div} target is the DOM element from which the events are generated
 * @param {object} options is a JSON describing the options
 *  * **diagonal**: default *27*, the screen diagonal in inch
 */
class PointerManager {
    constructor(target, options) {

        this.target = target;

        Object.assign(this, {
            diagonal: 27,                // Standard monitor 27"
            pinchMaxInterval: 200        // in ms, fingerDown event max distance in time to trigger a pinch.
        });

        if (options)
            Object.assign(this, options);

        this.currentPointers = [];
        this.eventObservers = new Map();
        this.ppmm = PointerManager.getPPMM(this.diagonal);

        this.target.style.touchAction = "none";
        this.target.addEventListener('pointerdown', (e) => this.handleEvent(e), false);
        this.target.addEventListener('pointermove', (e) => this.handleEvent(e), false);
        this.target.addEventListener('pointerup', (e) => this.handleEvent(e), false);
        this.target.addEventListener('pointercancel', (e) => this.handleEvent(e), false);
        this.target.addEventListener('wheel', (e) => this.handleEvent(e), false);
    }

    ///////////////////////////////////////////////////////////
    /// Constants
    static get ANYPOINTER() { return -1; }

    ///////////////////////////////////////////////////////////
    /// Utilities

    static splitStr(str) {
        return str.trim().split(/\s+/g);
    }

    static getPPMM(diagonal) {
        // sqrt(w^2 + h^2) / diagonal / 1in
        return Math.round(Math.sqrt(screen.width **2  + screen.height **2) / diagonal / 25.4);
    }

    ///////////////////////////////////////////////////////////
    /// Class interface

    // register pointer handlers.
    on(eventTypes, obj, idx = PointerManager.ANYPOINTER) {
        eventTypes = PointerManager.splitStr(eventTypes);

        if (typeof (obj) == 'function') {
            obj = Object.fromEntries(eventTypes.map(e => [e, obj]));
            obj.priority = -1000;
        }

        eventTypes.forEach(eventType => {
            if (idx == PointerManager.ANYPOINTER) {
                this.broadcastOn(eventType, obj);
            } else {
                const p = this.currentPointers[idx];
                if (!p) {
                    throw new Error("Bad Index");
                }
                p.on(eventType, obj);
            }
        });
        return obj;
    }

    // unregister pointer handlers
    off(eventTypes, callback, idx = PointerManager.ANYPOINTER) {
        if (idx == PointerManager.ANYPOINTER) {
            this.broadcastOff(eventTypes, callback);
        } else {
            PointerManager.splitStr(eventTypes).forEach(eventType => {
                const p = this.currentPointers[idx];
                if (!p) {
                    throw new Error("Bad Index");
                }
                p.off(eventType, callback);
            });
        }
    }

    onEvent(handler) {
        const cb_properties = ['fingerHover', 'fingerSingleTap', 'fingerDoubleTap', 'fingerHold', 'mouseWheel'];
        if (!handler.hasOwnProperty('priority'))
            throw new Error("Event handler has not priority property");

        if (!cb_properties.some((e) => typeof (handler[e]) == 'function'))
            throw new Error("Event handler properties are wrong or missing");

        for (let e of cb_properties)
            if (typeof (handler[e]) == 'function') {
                this.on(e, handler);
            }
        if(handler.panStart)
            this.onPan(handler);
        if(handler.pinchStart)
            this.onPinch(handler);
    }

    onPan(handler) {
        const cb_properties = ['panStart', 'panMove', 'panEnd'];
        if (!handler.hasOwnProperty('priority'))
            throw new Error("Event handler has not priority property");

        if (!cb_properties.every((e) => typeof (handler[e]) == 'function'))
            throw new Error("Pan handler is missing one of this functions: panStart, panMove or panEnd");

        handler.fingerMovingStart = (e) => {
            handler.panStart(e);
            if (!e.defaultPrevented) return;
             this.on('fingerMoving', (e1) => {
                handler.panMove(e1);
            }, e.idx);
            this.on('fingerMovingEnd', (e2) => {
                handler.panEnd(e2);
            }, e.idx);
        }
        this.on('fingerMovingStart', handler);
    }

    onPinch(handler) {
        const cb_properties = ['pinchStart', 'pinchMove', 'pinchEnd'];
        if (!handler.hasOwnProperty('priority'))
            throw new Error("Event handler has not priority property");

        if (!cb_properties.every((e) => typeof (handler[e]) == 'function'))
            throw new Error("Pinch handler is missing one of this functions: pinchStart, pinchMove or pinchEnd");

        handler.fingerDown = (e1) => {
            //find other pointers not in moving status
            const filtered = this.currentPointers.filter(cp => cp && cp.idx != e1.idx && cp.status == cp.stateEnum.DETECT);
            if (filtered.length == 0) return;

            //for each pointer search for the last fingerDown event.
            const fingerDownEvents = [];
            for (let cp of filtered) {
                let down = null;
                for (let e of cp.eventHistory.toArray())
                    if (e.fingerType == 'fingerDown')
                        down = e;
                if (down)
                    fingerDownEvents.push(down);
            }
            //we start from the closest one
            //TODO maybe we should sort by distance instead.
            fingerDownEvents.sort((a, b) => b.timeStamp - a.timeStamp);
            for (let e2 of fingerDownEvents) {
                if (e1.timeStamp - e2.timeStamp > this.pinchInterval) break; 

                handler.pinchStart(e1, e2);
                if (!e1.defaultPrevented) break;

                clearTimeout(this.currentPointers[e1.idx].timeout);
                clearTimeout(this.currentPointers[e2.idx].timeout);

                this.on('fingerMovingStart', (e) => e.preventDefault(), e1.idx); //we need to capture this event (pan conflict)
                this.on('fingerMovingStart', (e) => e.preventDefault(), e2.idx);
                this.on('fingerMoving',      (e) => e2 && handler.pinchMove(e1 = e, e2), e1.idx); //we need to assign e1 and e2, to keep last position.
                this.on('fingerMoving',      (e) => e1 && handler.pinchMove(e1, e2 = e), e2.idx);

                this.on('fingerMovingEnd', (e) => {
                    if (e2)
                        handler.pinchEnd(e, e2);
                    e1 = e2 = null;
                }, e1.idx);
                this.on('fingerMovingEnd', (e) => {
                    if (e1)
                        handler.pinchEnd(e1, e);
                    e1 = e2 = null;
                }, e2.idx);

                break;
            }
        }
        this.on('fingerDown', handler);
    }
    ///////////////////////////////////////////////////////////
    /// Implementation stuff

    // register broadcast handlers
    broadcastOn(eventType, obj) {
        const handlers = this.eventObservers.get(eventType);
        if (handlers)
            handlers.push(obj);
        else
            this.eventObservers.set(eventType, [obj]);
    }

    // unregister broadcast handlers
    broadcastOff(eventTypes, obj) {
        PointerManager.splitStr(eventTypes).forEach(eventType => {
            if (this.eventObservers.has(eventType)) {
                if (!obj) {
                    this.eventObservers.delete(eventType);
                } else {
                    const handlers = this.eventObservers.get(eventType);
                    const index = handlers.indexOf(obj);
                    if (index > -1) {
                        handlers.splice(index, 1);
                    }
                    if (handlers.length == 0) {
                        this.eventObservers.delete(eventType);
                    }
                }
            }
        });
    }

    // emit broadcast events
    broadcast(e) {
        if (!this.eventObservers.has(e.fingerType)) return;
        this.eventObservers.get(e.fingerType)
            .sort((a, b) => b.priority - a.priority)
            .every(obj => {
                obj[e.fingerType](e);
                return !e.defaultPrevented;
            });  // the first obj returning a defaultPrevented event breaks the every loop
    }

    addCurrPointer(cp) {
        let result = -1;
        for (let i = 0; i < this.currentPointers.length && result < 0; i++) {
            if (this.currentPointers[i] == null) {
                result = i;
            }
        }
        if (result < 0) {
            this.currentPointers.push(cp);
            result = this.currentPointers.length - 1;
        } else {
            this.currentPointers[result] = cp;
        }

        return result;
    }

    removeCurrPointer(index) {
        this.currentPointers[index] = null;
        while ((this.currentPointers.length > 0) && (this.currentPointers[this.currentPointers.length - 1] == null)) {
            this.currentPointers.pop();
        }
    }

    handleEvent(e) {
        if (e.type == 'pointerdown') this.target.setPointerCapture(e.pointerId);
        if (e.type == 'pointercancel') console.log(e);

        let handled = false;
        for (let i = 0; i < this.currentPointers.length && !handled; i++) {
            const cp = this.currentPointers[i];
            if (cp) {
                handled = cp.handleEvent(e);
                if (cp.isDone())
                    this.removeCurrPointer(i);
            }
        }
        if (!handled) {
            const cp = new SinglePointerHandler(this, e.pointerId, { ppmm: this.ppmm });
            handled = cp.handleEvent(e);
        }
        e.preventDefault();
    }

}


class SinglePointerHandler {
    constructor(parent, pointerId, options) {

        this.parent = parent;
        this.pointerId = pointerId;

        Object.assign(this, {
            ppmm: 3, // 27in screen 1920x1080 = 3 ppmm
        });
        if (options)
            Object.assign(this, options);

        this.eventHistory = new CircularBuffer(10);
        this.isActive = false;
        this.startTap = 0;
        this.threshold = 15; // 15mm

        this.eventObservers = new Map();
        this.isDown = false;
        this.done = false;

        this.stateEnum = {
            IDLE: 0,
            DETECT: 1,
            HOVER: 2,
            MOVING_START: 3,
            MOVING: 4,
            MOVING_END: 5,
            HOLD: 6,
            TAPS_DETECT: 7,
            SINGLE_TAP: 8,
            DOUBLE_TAP_DETECT: 9,
            DOUBLE_TAP: 10,
        };
        this.status = this.stateEnum.IDLE;
        this.timeout = null;
        this.holdTimeoutThreshold = 600;
        this.tapTimeoutThreshold = 300;
        this.upDuration = 400;
        this.oldDownPos = { clientX: 0, clientY: 0 };
        this.movingThreshold = 1; // 1mm
        this.idx = this.parent.addCurrPointer(this);
    }

    ///////////////////////////////////////////////////////////
    /// Utilities

    static distance(x0, y0, x1, y1) {
        return Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
    }

    distanceMM(x0, y0, x1, y1) {
        return SinglePointerHandler.distance(x0, y0, x1, y1) / this.ppmm;
    }

    ///////////////////////////////////////////////////////////
    /// Class interface

    on(eventType, obj) {
        this.eventObservers.set(eventType, obj);
    }

    off(eventType) {
        if (this.eventObservers.has(eventType)) {
            this.eventObservers.delete(eventType);
        }
    }

    ///////////////////////////////////////////////////////////
    /// Implementation stuff

    addToHistory(e) {
        this.eventHistory.push(e);
    }

    prevPointerEvent() {
        return this.eventHistory.last();
    }

    handlePointerDown(e) {
        this.startTap = e.timeStamp;
    }

    handlePointerUp(e) {
        const tapDuration = e.timeStamp - this.startTap;
    }

    isLikelySamePointer(e) {
        let result = this.pointerId == e.pointerId;
        if (!result && !this.isDown && e.type == "pointerdown") {
            const prevP = this.prevPointerEvent();
            if (prevP) {
                result = (e.pointerType == prevP.pointerType) && this.distanceMM(e.clientX, e.clientY, prevP.clientX, prevP.clientY) < this.threshold;
            }
        }
        return result;
    }

    // emit+broadcast
    emit(e) {
        if (this.eventObservers.has(e.fingerType)) {
            this.eventObservers.get(e.fingerType)[e.fingerType](e);
            if (e.defaultPrevented) return;
        }
        this.parent.broadcast(e);
    }

    // output Event, speed is computed only on pointermove
    createOutputEvent(e, type) {
        const result = e;
        result.fingerType = type;
        result.speedX = 0;
        result.speedY = 0;
        result.idx = this.idx;
        const prevP = this.prevPointerEvent();
        if (prevP && (e.type == 'pointermove')) {
            const dt = result.timeStamp - prevP.timeStamp;
            if (dt > 0) {
                result.speedX = (result.clientX - prevP.clientX) / dt * 1000.0;  // px/s
                result.speedY = (result.clientY - prevP.clientY) / dt * 1000.0;  // px/s
            }
        }
        return result;
    }

    // Finite State Machine
    processEvent(e) {
        let distance = 0;
        if (e.type == "pointerdown") {
            this.oldDownPos.clientX = e.clientX;
            this.oldDownPos.clientY = e.clientY;
            this.isDown = true;
        }
        if (e.type == "pointerup" || e.type == "pointercancel") this.isDown = false;
        if (e.type == "pointermove" && this.isDown) {
            distance = this.distanceMM(e.clientX, e.clientY, this.oldDownPos.clientX, this.oldDownPos.clientY)
        }

        if (e.type == "wheel") {
            this.emit(this.createOutputEvent(e, 'mouseWheel'));
            return;
        }

        switch (this.status) {
            case this.stateEnum.HOVER:
            case this.stateEnum.IDLE:
                if (e.type == 'pointermove') {
                    this.emit(this.createOutputEvent(e, 'fingerHover'));
                    this.status = this.stateEnum.HOVER;
                } else if (e.type == 'pointerdown') {
                    this.status = this.stateEnum.DETECT;
                    this.emit(this.createOutputEvent(e, 'fingerDown'));
                    if (e.defaultPrevented) { // An observer captured the fingerDown event
                        this.status = this.stateEnum.MOVING;
                        break;
                    }
                    this.timeout = setTimeout(() => {
                        this.emit(this.createOutputEvent(e, 'fingerHold'));
                        if(e.defaultPrevented) this.status = this.stateEnum.IDLE;
                    }, this.holdTimeoutThreshold);
                }
                break;
            case this.stateEnum.DETECT:
                if (e.type == 'pointercancel') { /// For Firefox
                    clearTimeout(this.timeout);
                    this.status = this.stateEnum.IDLE;
                    this.emit(this.createOutputEvent(e, 'fingerHold'));
                } else if (e.type == 'pointermove' && distance > this.movingThreshold) {
                    clearTimeout(this.timeout);
                    this.status = this.stateEnum.MOVING;
                    this.emit(this.createOutputEvent(e, 'fingerMovingStart'));
                } else if (e.type == 'pointerup') {
                    clearTimeout(this.timeout);
                    this.status = this.stateEnum.TAPS_DETECT;
                    this.timeout = setTimeout(() => {
                        this.status = this.stateEnum.IDLE;
                        this.emit(this.createOutputEvent(e, 'fingerSingleTap'));
                    }, this.tapTimeoutThreshold);
                }
                break;
            case this.stateEnum.TAPS_DETECT:
                if (e.type == 'pointerdown') {
                    clearTimeout(this.timeout);
                    this.status = this.stateEnum.DOUBLE_TAP_DETECT;
                    this.timeout = setTimeout(() => {
                        this.emit(this.createOutputEvent(e, 'fingerHold'));
                        if(e.defaultPrevented) this.status = this.stateEnum.IDLE;
                    }, this.tapTimeoutThreshold);
                } else if (e.type == 'pointermove' && distance > this.movingThreshold) {
                    clearTimeout(this.timeout);
                    this.status = this.stateEnum.IDLE;
                    this.emit(this.createOutputEvent(e, 'fingerHover'));
                }
                break;
            case this.stateEnum.DOUBLE_TAP_DETECT:
                if (e.type == 'pointerup' || e.type == 'pointercancel') {
                    clearTimeout(this.timeout);
                    this.status = this.stateEnum.IDLE;
                    this.emit(this.createOutputEvent(e, 'fingerDoubleTap'));
                }
                break;
            case this.stateEnum.DOUBLE_TAP_DETECT:
                if (e.type == 'pointermove' && distance > this.movingThreshold) {
                    this.status = this.stateEnum.MOVING;
                    this.emit(this.createOutputEvent(e, 'fingerMovingStart'));
                }
                break;
            case this.stateEnum.MOVING:
                if (e.type == 'pointermove') {
                    // Remain MOVING
                    this.emit(this.createOutputEvent(e, 'fingerMoving'));
                } else if (e.type == 'pointerup' || e.type == 'pointercancel') {
                    this.status = this.stateEnum.IDLE;
                    this.emit(this.createOutputEvent(e, 'fingerMovingEnd'));
                }
                break;
            default:
                console.log("ERROR " + this.status);
                console.log(e);
                break;
        }

        this.addToHistory(e);
    }

    handleEvent(e) {
        let result = false;
        if (this.isLikelySamePointer(e)) {
            this.pointerId = e.pointerId; //it's mine
            this.processEvent(e);
            result = true;
        }
        return result;
    }

    isDone() {
        return this.status == this.stateEnum.IDLE;
    }

}


class CircularBuffer {
    constructor(capacity) {
        if (typeof capacity != "number" || !Number.isInteger(capacity) || capacity < 1)
            throw new TypeError("Invalid capacity");
        this.buffer = new Array(capacity);
        this.capacity = capacity;
        this.first = 0;
        this.size = 0;
    }

    clear() {
        this.first = 0;
        this.size = 0;
    }

    empty() {
        return this.size == 0;
    }

    size() {
        return this.size;
    }

    capacity() {
        return this.capacity;
    }

    first() {
        let result = null;
        if (this.size > 0) result = this.buffer[this.first];
        return result;
    }

    last() {
        let result = null;
        if (this.size > 0) result = this.buffer[(this.first + this.size - 1) % this.capacity];
        return result;
    }

    enqueue(v) {
        this.first = (this.first > 0) ? this.first - 1 : this.first = this.capacity - 1;
        this.buffer[this.first] = v;
        if (this.size < this.capacity) this.size++;
    }

    push(v) {
        if (this.size == this.capacity) {
            this.buffer[this.first] = v;
            this.first = (this.first + 1) % this.capacity;
        } else {
            this.buffer[(this.first + this.size) % this.capacity] = v;
            this.size++;
        }
    }

    dequeue() {
        if (this.size == 0) throw new RangeError("Dequeue on empty buffer");
        const v = this.buffer[(this.first + this.size - 1) % this.capacity];
        this.size--;
        return v;
    }

    pop() {
        return this.dequeue();
    }

    shift() {
        if (this.size == 0) throw new RangeError("Shift on empty buffer");
        const v = this.buffer[this.first];
        if (this.first == this.capacity - 1) this.first = 0; else this.first++;
        this.size--;
        return v;
    }

    get(start, end) {
        if (this.size == 0 && start == 0 && (end == undefined || end == 0)) return [];
        if (typeof start != "number" || !Number.isInteger(start) || start < 0) throw new TypeError("Invalid start value");
        if (start >= this.size) throw new RangeError("Start index past end of buffer: " + start);

        if (end == undefined) return this.buffer[(this.first + start) % this.capacity];

        if (typeof end != "number" || !Number.isInteger(end) || end < 0) throw new TypeError("Invalid end value");
        if (end >= this.size) throw new RangeError("End index past end of buffer: " + end);

        if (this.first + start >= this.capacity) {
            start -= this.capacity;
            end -= this.capacity;
        }
        if (this.first + end < this.capacity)
            return this.buffer.slice(this.first + start, this.first + end + 1);
        else
            return this.buffer.slice(this.first + start, this.capacity).concat(this.buffer.slice(0, this.first + end + 1 - this.capacity));
    }

    toArray() {
        if (this.size == 0) return [];
        return this.get(0, this.size - 1);
    }

}




export { PointerManager }