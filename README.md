# Openlime
Web-based, advanced images viewer (RTI, multispectral, BRDF, etc. )

## Installing npm

### Ubuntu

```bash
sudo apt install npm
```

#### Ubuntu 18.04
You might have some problem using the old npm version shipped with Ubuntu18.04, and even upgrading it. This worked for me:
```bash
sudo npm install -g npm@latest-6
```

### Windows
To obtain npm, you need to download the Windows version
of node.js from https://nodejs.org/en/download/ .
You can download either the Windows Installer (.msi) or
Windows Binary (.zip) version.  If you download the Windows
Binary version, you will need to set your PATH variable
to include the directory containing the npm executable, which
is in the subdirectory `node_modules\npm\bin`.

## Setting up npm (all platforms)

The following steps should be performed in the `openlime`
directory that was cloned from this repository.

Install the package.  This command tells npm to download
all the webpack packages (and their dependencies) listed in the
`package.json` file.  This will be put in the `./node_modules`
directory.

```bash
npm install
```

The downloaded packages include `rollup`, `documentation`,
and `nodemon`, which will be used below.
 
## Using npm (all platforms)

### Build the code
Transpile the code in `./src`, and
put the results in `./dist/main.js`.
```bash
npm run build
```

This transpiled code is used, for example, by the
`./dist/index.html` web page.

### Run the node.js server

If you wish, you can run the node.js development server.
This server will treat `./dist` as the home directory.
The server is run in "hot" mode, which means that 
whenever you change a file in the `./src` directory, 
the webpack code will automatically be recreated, and
your web browser will automatically refresh, to reflect
the latest changes.
```bash
npm run start
```

Then access the demo app at: http://localhost:8080

If you prefer to run with a different port, say `8088`, you can use
```bash
npm run start -- --port 8088
```

### Create a rollup file to use with other servers

You do not need to use node.js as the server.  Instead, you
can use the `<script>` approach, embedding a rollup file, either
`./build/openlime.min.js`
or 
`./build/openlime.js`,
in your web page.  
The files
`./dist/ui_custom.html` and `.dist/ui_svg.html` are examples of
this approach.  
Such files will display correctly when served from any web server.
To create the rollup files, call `rollup`:

```bash
npm run rollup
```

### Keep the rollup files up to date

If you keep a `nodemon` (**node** **mon**itor) script running, it
will automatically update the rollup files
`./build/openlime.min.js`
and 
`./build/openlime.js` 
whenever you change anything in the `.src` directory.
Note that unlike with the node.js server, your web page will
not refresh automatically; you will have to do that yourself
once the rollup files have been updated.

```bash
npm run nodemon
```

### Create documentation

Documentation can be created from structured comments in the
source code (in `./src`).
This documentation, once created, is accessed from `./docs/index.html`

```bash
npm run documentation
```

### Customization

skin.css

skin.svg

Run 
```bash
svgo -p skin.svg -o skin.min.svg
```
to minimize svg.


Documentation.js supports markdown syntax and JSDoc syntax.



JSON example of the configuration:


```
{
	camera: { 
	},
	canvas: {
		rasters: [
			{
				id:
				name:
				width: //optional
				height: //optional
				url: 
				layout: <image|google|deepzoom|zoomify|iip|iiif> //optional if can be recovered from the url.
				

			}
		]
	},
	overlay: {
	}
}
```



