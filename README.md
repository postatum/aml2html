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
Usage: npm run aml2html -- [options] <outputDir>

Convert AML Vocabularies & Dialects to HTML

Options:
  -d, --indir <path>   Path to input directory to convert. Takes precedence over --infile.
  -f, --infile <path>  Path to input file to convert (default: [])
  -s, --syntax <name>  Output syntax (html or md) (default: "html")
  -c, --css <path>     Custom css file path (default: [])
  -g, --cfg <path>     Configuration file path
  -h, --help           output usage information
```

E.g.:
```sh
$ npm run aml2html -- ./outdir --infile=test_data/amf/dialects/canonical_webapi.yaml --infile=test_data/amf/dialects/oas20.yaml --infile=test_data/amf/dialects/validation.yaml --infile=test_data/music/dialect/playlist.yaml
```

Or using `--indir` option:
```sh
$ npm run aml2html -- ./outdir --indir=./test_data
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
$ npm run aml2html -- ./outdir --indir=./test_data --cfg=cfg.js
```

Configuration files will be searched relative to the working directory of the node interpreter.

## Viewing generated HTML
Open the directory specified as `--outdir` option value and open any `.html` file in a browser.
