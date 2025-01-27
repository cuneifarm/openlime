import { Controller } from './Controller.js'
import { Camera } from './Camera.js'

class ControllerPanZoom extends Controller {

	constructor(camera, options) {
		super(options);

		this.camera = camera;
		this.zoomAmount = 1.2;          //for wheel or double tap event
		
		
		this.panning = false;           //true if in the middle of a pan
		this.initialTransform = null;
		this.startMouse = null;

		this.zooming = false;           //true if in the middle of a pinch
		this.initialDistance = 0.0;
	}

	panStart(e) {
		if(!this.active || this.panning)
			return;
		this.panning = true;

		this.startMouse = { x: e.offsetX, y: e.offsetY };

		let now = performance.now();
		this.initialTransform = this.camera.getCurrentTransform(now);
		this.camera.target = this.initialTransform.copy(); //stop animation.
		e.preventDefault();
	}

	panMove(e) {
		if (!this.panning)
			return;

		let m = this.initialTransform;
		let dx = (e.offsetX - this.startMouse.x);
		let dy = (e.offsetY - this.startMouse.y);
		
		this.camera.setPosition(this.panDelay, m.x + dx, m.y + dy, m.z, m.a);
	}

	panEnd(e) {
		this.panning = false;
	}

	distance(e1, e2) {
		return Math.sqrt(Math.pow(e1.x - e2.x, 2) + Math.pow(e1.y - e2.y, 2));
	}

	pinchStart(e1, e2) {
		this.zooming = true;
		this.initialDistance = this.distance(e1, e2);
		e1.preventDefault();
		//e2.preventDefault(); //TODO this is optional?
	}

	pinchMove(e1, e2) {
		if (!this.zooming)
			return;
		const scale = this.distance(e1, e2);
		const pos = this.camera.mapToScene((e1.x + e2.x)/2, (e1.y + e2.y)/2, this.camera.getCurrentTransform(performance.now()));
		const absoluteZoom = this.camera.target.z * scale/this.initialDistance;
		this.camera.zoom(this.zoomDelay, absoluteZoom, pos.x, pos.y);
		this.initialDistance = scale;
	}

	pinchEnd(e, x, y, scale) {
		this.zooming = false;
	}

	mouseWheel(e) {
		let delta = e.deltaY > 0 ? 1 : -1;
		const pos = this.camera.mapToScene(e.offsetX, e.offsetY, this.camera.getCurrentTransform(performance.now()));
		const dz = Math.pow(this.zoomAmount, delta);		
		this.camera.deltaZoom(this.zoomDelay, dz, pos.x, pos.y);
		e.preventDefault();
	}

	fingerDoubleTap(e) {
		const pos = this.camera.mapToScene(e.offsetX, e.offsetY, this.camera.getCurrentTransform(performance.now()));
		const dz = this.zoomAmount;
		this.camera.deltaZoom(this.zoomDelay, dz, pos.x, pos.y);
	}

}

export { ControllerPanZoom }
