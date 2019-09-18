# aml2html
Convert AML Vocabularies & Dialects to HTML.

## Installation
```sh
$ git clone git@github.com:aml-org/aml2html.git
$ cd aml2html
$ npm install
```

## Usage
CLI command notation (*note the required `--` before arguments*):
```
npm run aml2html -- <dialectPath>... --outdir=DIR --css=https://foo.bar/some.css --css=/another.css
```

E.g.
```sh
$ npm run aml2html -- test_data/amf/dialects/canonical_webapi.yaml test_data/amf/dialects/oas20.yaml test_data/amf/dialects/validation.raml test_data/music/dialect/playlist.yaml --outdir=./test_data/html/
```

## Configuration

The HTML generation can be customised by providing additional JS code that changes the behaviour of the generator.
Configuration code is passed as a JS referenced in the `cfg` invocation parameter.

The file must export a JS module with the following symbols:

* `idMapping`: Function used to generate the final URIs shown in the HTML documentation for entities and dialects
* `dialectsHeader`: Name of the header used for the dialects section in the documentaton
* `schemasHeader`: Name of the header used for the schemas section in the documentation
* `indexHeader`: Header to be displayed on the `index.html` page
* `indexVersion`: Version to be displayed on the `index.html` page
* `indexDescription`: Description to be displayed on the `index.html` page

The following snippet shows a custom configuration stored in the `cfg.js` file:

```javascript
module.exports = {
  idMapping: function(id) {
    return id + "_modified";
  },
  dialectsHeader: "My label for dialects",
  schemasHeader: "My label for schemas",
  indexHeader: "My dialects",
  indexVersion: "Version 1.0",
  indexDescription: "My first list of dialects"
}
```

This file can be used when invoking the HTML generator in the following way:

E.g.
```sh
$ npm run aml2html -- test_data/amf/dialects/canonical_webapi.yaml test_data/amf/dialects/oas20.yaml test_data/amf/dialects/validation.raml test_data/music/dialect/playlist.yaml --outdir=./test_data/html/ --cfg=cfg.js
```

Configuration files will be searched relative to the working directory of the node interpreter.

## Viewing generated HTML
Open the directory specified as `--outdir` option value and open any `.html` file in a browser.
