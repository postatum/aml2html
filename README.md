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

## Viewing generated HTML
Open the directory specified as `--outdir` option value and open any `.html` file in a browser.
