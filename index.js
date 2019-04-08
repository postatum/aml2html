var amf = require("amf-client-js")


return amf.AMF.init()
  .then(() => {
    return new amf.Aml10Parser()
      .parseFileAsync("file://vocabularies/aml_doc.yaml")
  })
  .then((model) => {
    return amf.AMF.amfGraphGenerator().generateString(model)
  })
  .then((generated) => {
    console.log(JSON.stringify(JSON.parse(generated), null, 2))
  })
