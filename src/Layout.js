import { BoundingBox } from "./BoundingBox";

/**
 * @param {string|Object} url URL of the image or the tiled config file, 
 * @param {string} type select one among: <image, {@link https://www.microimages.com/documentation/TechGuides/78googleMapsStruc.pdf google}, {@link https://docs.microsoft.com/en-us/previous-versions/windows/silverlight/dotnet-windows-silverlight/cc645077(v=vs.95)?redirectedfrom=MSDN deepzoom}, {@link http://www.zoomify.com/ZIFFileFormatSpecification.htm zoomify}, {@link https://iipimage.sourceforge.io/ iip}, {@link https://iiif.io/api/image/3.0/ iiif}>
 */
class Layout {
	constructor(url, type, options) {
		Object.assign(this, {
			type: type,
			width: 0,
			height: 0,
			tilesize: 256,
			overlap: 0, 
			nlevels: 1,        //level 0 is the top, single tile level.
			tiles: [],
			suffix: 'jpg',
			qbox: [],          //array of bounding box in tiles, one for mipmap 
			bbox: [],          //array of bounding box in pixels (w, h)

			signals: { ready: [], updateSize: [] },          //callbacks when the layout is ready.
			status: null
		});
		if(options)
			Object.assign(this, options);

		if(typeof(url) == 'string') {
			this.url = url;

			(async () => {
				switch(this.type) {
					case 'image':    await this.initImage(); break;
					case 'google':   await this.initGoogle(); break;
					case 'deepzoom': await this.initDeepzoom(); break;
					case 'tarzoom':  await this.initTarzoom(); break;
					case 'zoomify':  await this.initZoomify(); break;
					case 'iiif':     await this.initIIIF(); break;
				}
				this.initBoxes();
				this.status = 'ready';
				this.emit('ready');
				
			})().catch(e => { console.log(e); this.status = e; });
		}

		if(typeof(url) == 'object')
			Object.assign(this, url);
	}

	addEvent(event, callback) {
		this.signals[event].push(callback);
	}

	emit(event) {
		for(let r of this.signals[event])
			r(this);
	}

	isReady() {
		return this.status == 'ready' && this.width && this.height;
	}

	boundingBox() {
		if(!this.width) throw "Layout not initialized still";
		return new BoundingBox({xLow:-this.width/2, yLow: -this.height/2, xHigh: this.width/2, yHigh: this.height/2});
	}

/**
 *  Each tile is assigned an unique number.
 */

	index(level, x, y) {
		let startindex = 0;
		for(let i = 0; i < level; i++)
			startindex += this.qbox[i].xHigh*this.qbox[i].yHigh;
		return startindex + y*this.qbox[level].xHigh + x;
	}

/*
 * Compute all the bounding boxes (this.bbox and this.qbox).
 * @return number of tiles in the dataset
*/

	initBoxes() {
		this.qbox = []; //by level (0 is the bottom)
		this.bbox = [];
		var w = this.width;
		var h = this.height;

		if(this.type == 'image') {
			this.qbox[0] = new BoundingBox({xLow:0, yLow: 0, xHigh: 1, yHigh: 1});
			this.bbox[0] = new BoundingBox({xLow:0, yLow: 0, xHigh: w, yHigh: h}); 
			this.tiles.push({index:0, level:0, x:0, y:0});
			// Acknowledge bbox change (useful for knowing scene extension (at canvas level))
			this.emit('updateSize');
			return 1;
		}

		let tiles = [];
		var index = 0;
		for(let level = this.nlevels - 1; level >= 0; level--) {
			this.qbox[level] = new BoundingBox({xLow:0, yLow: 0, xHigh: 0, yHigh: 0});
			this.bbox[level] = new BoundingBox({xLow:0, yLow: 0, xHigh: w, yHigh: h}); 
			for(let y = 0; y*this.tilesize < h; y++) {
				this.qbox[level].yHigh = y+1;
				for(let x = 0; x*this.tilesize < w; x ++) {
					this.qbox[level].xHigh = x+1;
					tiles.push({level:level, x:x, y:y});
				}
			}
			w >>>= 1;
			h >>>= 1;
		}
		this.tiles = [];
		for(let tile of tiles) {
			let index = this.index(tile.level, tile.x, tile.y);
			tile.index = index;
			this.tiles[index] = tile;
		}

		// Acknowledge bbox (useful for knowing scene extension (at canvas level))
		this.emit('updateSize');
	}

/** Return the coordinates of the tile (in [0, 0, w h] image coordinate system) and the texture coords associated. 
 *
 */
	tileCoords(level, x, y) {
		let w = this.width;
		let h = this.height;
		//careful: here y is inverted due to textures not being flipped on load (Firefox fault!).
		var tcoords = new Float32Array([0, 1,     0, 0,     1, 0,     1, 1]);

		if(this.type == "image") {
			return { 
				coords: new Float32Array([-w/2, -h/2, 0,  -w/2, h/2, 0,  w/2, h/2, 0,  w/2, -h/2, 0]),
				tcoords: tcoords 
			};
		}

		let coords = new Float32Array([0, 0, 0,  0, 1, 0,  1, 1, 0,  1, 0, 0]);

		let ilevel = this.nlevels - 1 - level;
		let side =  this.tilesize*(1<<(ilevel)); //tile size in imagespace
		let tx = side;
		let ty = side;

		if(side*(x+1) > this.width) {
			tx = (this.width  - side*x);
			if(this.type == 'google')
				tcoords[4] = tcoords[6] = tx/side;
		}

		if(side*(y+1) > this.height) {
			ty = (this.height - side*y);
			if(this.type == 'google')
				tcoords[1] = tcoords[7] = ty/side;
		}

		var lx  = this.qbox[level].xHigh-1; //last tile x pos, if so no overlap.
		var ly  = this.qbox[level].yHigh-1;

		var over = this.overlap;
		if(over) {
			let dtx = over / (tx/(1<<ilevel) + (x==0?0:over) + (x==lx?0:over));
			let dty = over / (ty/(1<<ilevel) + (y==0?0:over) + (y==ly?0:over));

			tcoords[0] = tcoords[2] = (x==0? 0: dtx);
			tcoords[3] = tcoords[5] = (y==0? 0: dty);
			tcoords[4] = tcoords[6] = (x==lx? 1: 1 - dtx);
			tcoords[1] = tcoords[7] = (y==ly? 1: 1 - dty);
		} 
		//flip Y coordinates 
		//TODO cleanup this mess!
		let tmp = tcoords[1];
		tcoords[1] = tcoords[7] = tcoords[3];
		tcoords[3] = tcoords[5] = tmp;

		for(let i = 0; i < coords.length; i+= 3) {
			coords[i]   =  coords[i]  *tx + side*x - this.width/2;
			coords[i+1] = -coords[i+1]*ty - side*y + this.height/2;
		}

		return { coords: coords, tcoords: tcoords }
	}


/**
 * Given a viewport and a transform computes the tiles needed for each level.
 * @param {array} viewport array with left, bottom, width, height
 * @param {border} border is radius (in tiles units) of prefetch
 * @returns {object} with level: the optimal level in the pyramid, pyramid: array of bounding boxes in tile units.
 */
	neededBox(viewport, transform, border, bias) {
		if(this.type == "image")
			return { level:0, pyramid: [new BoundingBox({ xLow:0, yLow:0, xHigh:1, yHigh:1 })] };

		//here we are computing with inverse levels; level 0 is the bottom!
		let iminlevel = Math.max(0, Math.min(Math.floor(-Math.log2(transform.z) + bias), this.nlevels-1));
		let minlevel = this.nlevels-1-iminlevel;
		//
		let bbox = transform.getInverseBox(viewport);
		//find box in image coordinates where (0, 0) is in the upper left corner.
		bbox.shift(this.width/2, this.height/2);

		let pyramid = [];
		for(let level = 0; level <= minlevel; level++) {
			let ilevel = this.nlevels -1 -level;
			let side = this.tilesize*Math.pow(2, ilevel);

			let qbox = new BoundingBox(bbox);
			qbox.quantize(side);

			//clamp!
			qbox.xLow  = Math.max(qbox.xLow  - border, this.qbox[level].xLow);
			qbox.yLow  = Math.max(qbox.yLow  - border, this.qbox[level].yLow);
			qbox.xHigh = Math.min(qbox.xHigh + border, this.qbox[level].xHigh);
			qbox.yHigh = Math.min(qbox.yHigh + border, this.qbox[level].yHigh);
			pyramid[level] = qbox;
		}
		return { level: minlevel, pyramid: pyramid };
	}

	getTileURL(url, tile) {
		throw Error("Layout not defined or ready.");
	}



/*
 * Witdh and height can be recovered once the image is downloaded.
*/
	initImage() {
		this.getTileURL = (url, tile) => { return url; }
		this.nlevels = 1;
		this.tilesize = 0;
	}

/**
 *  url points to the folder (without /)

 *  width and height must be defined
 */
	initGoogle(callback) {
		if(!this.width || !this.height)
			throw "Google rasters require to specify width and height";

		this.tilesize = 256;
		this.overlap = 0;

		let max = Math.max(this.width, this.height)/this.tilesize;
		this.nlevels = Math.ceil(Math.log(max) / Math.LN2) + 1;

		this.getTileURL = (url, tile) => {
			return url + "/" + tile.level + "/" + tile.y + "/" + tile.x + '.' + this.suffix;
		};
	}


/**
 * Expects the url to point to .dzi config file
 */
	async initDeepzoom() {		
		var response = await fetch(this.url);
		if(!response.ok) {
			this.status = "Failed loading " + this.url + ": " + response.statusText;
			return;
		}
		let text = await response.text();
		let xml = (new window.DOMParser()).parseFromString(text, "text/xml");

		let doc = xml.documentElement;
		this.suffix = doc.getAttribute('Format');
		this.tilesize = parseInt(doc.getAttribute('TileSize'));
		this.overlap = parseInt(doc.getAttribute('Overlap'));

		let size = doc.querySelector('Size');
		this.width = parseInt(size.getAttribute('Width'));
		this.height = parseInt(size.getAttribute('Height'));

		let max = Math.max(this.width, this.height)/this.tilesize;
		this.nlevels = Math.ceil(Math.log(max) / Math.LN2) + 1;

		this.url = this.url.substr(0, this.url.lastIndexOf(".")) + '_files/';

		this.getTileURL = (url, tile) => {
			url = url.substr(0, url.lastIndexOf(".")) + '_files/';
			return url + tile.level + '/' + tile.x + '_' + tile.y + '.' + this.suffix;
		}; 
	}

	async initTarzoom() {		
		var response = await fetch(this.url);
		if(!response.ok) {
			this.status = "Failed loading " + this.url + ": " + response.statusText;
			return;
		}
		let json = await response.json();
		Object.assign(this, json); //suffix, tilesize, overlap, width, height, levels
		//this.nlevels = this.levels.length;
		this.url = this.url.substr(0, this.url.lastIndexOf(".")) + '.tzb';

		this.getTileURL = (url, tile) => {
			tile.start = this.offsets[tile.index];
			tile.end = this.offsets[tile.index+1];
			url = url.substr(0, url.lastIndexOf(".")) + '.tzb';
			return url; // + level + '/' + x + '_' + y + '.' + this.suffix;
		}; 
	}



/**
 * Expects the url to point to ImageProperties.xml file.
 */
	async initZoomify() {
		this.overlap = 0;
		var response = await fetch(this.url);
		if(!response.ok) {
			this.status = "Failed loading " + this.url + ": " + response.statusText;
			return;
		}
		let text = await response.text();
		let xml = (new window.DOMParser()).parseFromString(text, "text/xml");
		let doc = xml.documentElement;
		this.tilesize = parseInt(doc.getAttribute('TILESIZE'));
		this.width = parseInt(doc.getAttribute('WIDTH'));
		this.height = parseInt(doc.getAttribute('HEIGHT'));
		if(!this.tilesize || !this.height || !this.width)
			throw "Missing parameter files for zoomify!";

		let max = Math.max(this.width, this.height)/this.tilesize;
		this.nlevels = Math.ceil(Math.log(max) / Math.LN2) + 1;

		this.url = this.url.substr(0, this.url.lastIndexOf("/"));

		this.getTileURL = (url, tile) => {
			//let index = this.index(level, x, y)>>>0;
			let group = tile.index >> 8;
			url = url.substr(0, url.lastIndexOf("/"));
			return this.url + "/TileGroup" + group + "/" + tile.level + "-" + tile.x + "-" + tile.y + "." + this.suffix;
		};
	}

	async initIIIF() {
		this.overlap = 0;

		var response = await fetch(this.url);
		if(!response.ok) {
			this.status = "Failed loading " + this.url + ": " + response.statusText;
			return;
		}
		let info = await response.json();
		this.width = info.width;
		this.height = info.height;
		this.nlevels = info.tiles[0].scaleFactors.length;
		this.tilesize = info.tiles[0].width;

		this.url = this.url.substr(0, this.url.lastIndexOf("/"));

		this.getTileURL = (url, tile) => {
			let tw = this.tilesize;
			let ilevel = parseInt(this.nlevels - 1 - tile.level);
			let s = Math.pow(2, tile.level);

			//region parameters
			let xr = tile.x * tw * s;
			let yr = tile.y * tw * s;
			let wr = Math.min(tw * s, this.width - xr)
			let hr = Math.min(tw * s, this.height - yr);

			// pixel size parameters /ws,hs/
			let ws = tw
			if (xr + tw*s > this.width)
				ws = (this.width - xr + s - 1) / s  
			let hs = tw
			if (yr + tw*s > this.height)
				hs = (this.height - yr + s - 1) / s

			url = url.substr(0, url.lastIndexOf("/"));
			return `${url}/${xr},${yr},${wr},${hr}/${ws},${hs}/0/default.jpg`;
		};
	}
}

export { Layout }
