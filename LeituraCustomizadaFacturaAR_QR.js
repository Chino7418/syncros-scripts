function LeituraCustomizadaFacturaAR_QR () {
    var _this = this;

    // Campos que vamos a extraer del QR AFIP
    var cuitEmisor = '';
    var tipoComprobante = '';
    var puntoVenta = '';
    var nroComprobante = '';
    var fechaEmision = '';
    var importeTotal = '';
    var moneda = '';
    var caeAutorizacion = '';
    var titulo = '';

    // Mapeo de código AFIP de tipo de comprobante -> letra visible
    // (fuente: tabla de códigos de comprobante de AFIP, "tipoCmp" del QR)
    const tiposComprobante = {
        1: 'A', 2: 'A', 3: 'A', 6: 'B', 7: 'B', 8: 'B', 11: 'C', 12: 'C', 13: 'C',
        51: 'M', 81: 'A', 82: 'B', 83: 'C'
    };

    this.IniciaValores = function () {
        this.cuitEmisor = '';
        this.tipoComprobante = '';
        this.puntoVenta = '';
        this.nroComprobante = '';
        this.fechaEmision = '';
        this.importeTotal = '';
        this.moneda = '';
        this.caeAutorizacion = '';
        this.titulo = '';
    }

    this.GetNomeArquivo = function () {
        return 'LeituraCustomizadaFacturaAR_QR.js';
    }

    this.initCustomFunctionFacturaAR = function (nomeDocumento) {
        _this.ExtracaoInfoFacturaAR();
    }

    this.ExtracaoInfoFacturaAR = function () {
        try {
            while (DWObject.CurrentImageIndexInBuffer < (DWObject.HowManyImagesInBuffer - 1)) {
                DWObject.CurrentImageIndexInBuffer = DWObject.HowManyImagesInBuffer - 1;
            }
            _this.LeerQrAfip();
        } catch (ex) {
            console.log('ExtracaoInfoFacturaAR error: ' + ex);
            objSyncrosGlobal.FuncoesSatelites.hideLoading();
        }
    }

    this.LeerQrAfip = function () {
        if (DWObject.HowManyImagesInBuffer == 0) {
            objSyncrosGlobal.InteracoesFluig.showToast({
                message: 'Ningún documento disponible para la operación.',
                type: "warning"
            });
            objSyncrosGlobal.FuncoesSatelites.hideLoading();
            return;
        }

        _this.IniciaValores();

        // ---------------------------------------------------------------
        // SUPOSICIÓN A VERIFICAR: Dynamic Web TWAIN expone su lector de
        // códigos nativo como DWObject.Addon.BarcodeReader.getBarcodes(...)
        // en versiones recientes de la SDK, o como DWObject.BarcodeReader
        // en versiones más viejas. Si tira "undefined", correr en la consola
        // del navegador: console.log(DWObject) y buscar la propiedad real
        // (buscar "Barcode" en el árbol de propiedades).
        // ---------------------------------------------------------------
        var barcodeReader = (DWObject.Addon && DWObject.Addon.BarcodeReader)
            ? DWObject.Addon.BarcodeReader
            : DWObject.BarcodeReader;

        if (!barcodeReader) {
            console.log('No se encontró el lector de códigos de barras/QR en DWObject. Revisar versión de la SDK.');
            objSyncrosGlobal.FuncoesSatelites.hideLoading();
            return;
        }

        barcodeReader.getBarcodes(
            [DWObject.CurrentImageIndexInBuffer],
            function (results) {
                _this.ProcesarResultadoBarcode(results);
            },
            function (errorCode, errorString) {
                console.log('Error leyendo QR: ' + errorCode + ' - ' + errorString);
                objSyncrosGlobal.FuncoesSatelites.hideLoading();
                objSyncrosGlobal.InteracoesFluig.showToast({
                    message: 'No se pudo leer el código QR del comprobante.',
                    type: "warning"
                });
                _this.AddItemAndTestForNext();
            }
        );
    }

    this.ProcesarResultadoBarcode = function (results) {
        try {
            if (!results || results.length == 0) {
                console.log('No se detectó ningún QR/código de barras en la imagen.');
                _this.AddItemAndTestForNext();
                return;
            }

            // Puede haber más de un código en la página; nos quedamos con el
            // primero que matchee la URL del QR AFIP.
            var qrAfip = null;
            for (var i = 0; i < results.length; i++) {
                var texto = results[i].BarcodeText || results[i].text || '';
                if (texto.indexOf('afip.gob.ar') >= 0) {
                    qrAfip = texto;
                    break;
                }
            }

            if (!qrAfip) {
                console.log('Se detectaron códigos pero ninguno corresponde a un QR AFIP.');
                _this.AddItemAndTestForNext();
                return;
            }

            _this.ParsearQrAfip(qrAfip);
            _this.AddItemAndTestForNext();
        } catch (ex) {
            console.log('ProcesarResultadoBarcode error: ' + ex);
            _this.AddItemAndTestForNext();
        }
    }

    // El QR AFIP es una URL del tipo:
    // https://www.afip.gob.ar/fe/qr/?p=<base64 de un JSON>
    // El JSON tiene: ver, fecha, cuit, ptoVta, tipoCmp, nroCmp, importe,
    // moneda, ctz, tipoDocRec, nroDocRec, tipoCodAut, codAut
    this.ParsearQrAfip = function (urlQr) {
        try {
            var partes = urlQr.split('?p=');
            if (partes.length < 2) {
                console.log('URL de QR AFIP sin parámetro p=: ' + urlQr);
                return;
            }
            var base64Data = decodeURIComponent(partes[1]);
            var jsonTexto = atob(base64Data);
            var datos = JSON.parse(jsonTexto);

            _this.cuitEmisor = datos.cuit ? String(datos.cuit) : '';
            _this.puntoVenta = datos.ptoVta ? String(datos.ptoVta) : '';
            _this.nroComprobante = datos.nroCmp ? String(datos.nroCmp) : '';
            _this.fechaEmision = datos.fecha || '';
            _this.importeTotal = (datos.importe != null) ? String(datos.importe) : '';
            _this.moneda = datos.moneda || '';
            _this.caeAutorizacion = datos.codAut ? String(datos.codAut) : '';

            _this.tipoComprobante = tiposComprobante[datos.tipoCmp] || String(datos.tipoCmp || '');

            // Título de referencia: "Factura A 0005-00001127" por ejemplo
            var ptoVtaPad = _this.puntoVenta ? _this.puntoVenta.padStart(4, '0') : '';
            var nroCmpPad = _this.nroComprobante ? _this.nroComprobante.padStart(8, '0') : '';
            _this.titulo = 'Factura ' + _this.tipoComprobante + ' ' + ptoVtaPad + '-' + nroCmpPad;

        } catch (ex) {
            console.log('ParsearQrAfip error (QR mal formado o no es AFIP): ' + ex);
        }
    }

    this.AddItemAndTestForNext = function () {
        var index = objSyncrosGlobal.FuncoesSatelites.doGetDocumentIndexByPage(DWObject.CurrentImageIndexInBuffer);
        _this.AddItemJSonValoresOcr(index);
        if ((DWObject.CurrentImageIndexInBuffer <= 0) ||
            (objSyncrosGlobal.FuncoesSatelites.IsMultiPageDocument() && objSyncrosGlobal.documentArray.length == 1)) {
            objSyncrosGlobal.updateDocumentTableFromOutside();
            objSyncrosGlobal.FuncoesSatelites.hideLoading();
        } else {
            var idx = this.GetNextDocumentIndex();
            while (DWObject.CurrentImageIndexInBuffer != idx) {
                DWObject.CurrentImageIndexInBuffer = idx;
            }
            _this.LeerQrAfip();
        }
    }

    this.GetNextDocumentIndex = function () {
        var index = 0;
        if (objSyncrosGlobal.FuncoesSatelites.IsMultiPageDocument()) {
            var documentIndex = objSyncrosGlobal.FuncoesSatelites.doGetDocumentIndexByPage(DWObject.CurrentImageIndexInBuffer - 1);
            if (documentIndex > 0) {
                for (var h = 0; h < documentIndex; h++) {
                    index += objSyncrosGlobal.documentArray[h].pageCount;
                }
            }
        } else {
            index = DWObject.CurrentImageIndexInBuffer - 1;
        }
        return index;
    }

    // Mapeo campo -> nombre del descriptor en el tipo de documento (nome).
    // AJUSTAR estos nombres para que coincidan EXACTO con los "nome" que
    // definiste en el tipo de documento de Syncros.
    this.AddItemJSonValoresOcr = function (index) {
        var valores = objSyncrosGlobal.valoresJson[index].values;

        if (valores.hasOwnProperty('titulo')) {
            valores.titulo.value = this.titulo;
        }
        if (valores.hasOwnProperty('cuitproveedor')) {
            valores.cuitproveedor.value = this.cuitEmisor;
        }
        if (valores.hasOwnProperty('cuitemisor')) {
            valores.cuitemisor.value = this.cuitEmisor;
        }
        if (valores.hasOwnProperty('tipocomprobante')) {
            valores.tipocomprobante.value = this.tipoComprobante;
        }
        if (valores.hasOwnProperty('puntoventa')) {
            valores.puntoventa.value = this.puntoVenta;
        }
        if (valores.hasOwnProperty('nrocomprobante')) {
            valores.nrocomprobante.value = this.nroComprobante;
        }
        if (valores.hasOwnProperty('fechaemision')) {
            valores.fechaemision.value = this.fechaEmision;
        }
        if (valores.hasOwnProperty('importetotal')) {
            valores.importetotal.value = this.importeTotal;
        }
        if (valores.hasOwnProperty('moneda')) {
            valores.moneda.value = this.moneda;
        }
        if (valores.hasOwnProperty('caeautorizacion')) {
            valores.caeautorizacion.value = this.caeAutorizacion;
        }
    }
}

//************************************************** INIT FUNCTION ***************************************************************** */

var initObjectFacturaAR = new LeituraCustomizadaFacturaAR_QR();
objSyncrosGlobal.objDatasetDocumentType.values.forEach(obj => {
    if (obj["customJsFile"] && obj["customJsFile"].toLowerCase().indexOf(initObjectFacturaAR.GetNomeArquivo().toLowerCase()) >= 0) {
        obj['initCustomFunction'] = initObjectFacturaAR.initCustomFunctionFacturaAR;
    }
});

//************************************************** INIT FUNCTION ***************************************************************** */
