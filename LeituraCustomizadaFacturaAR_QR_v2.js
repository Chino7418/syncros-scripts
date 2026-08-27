function LeituraCustomizadaFacturaAR_QR () {
    var _this = this;

    var cuitEmisor = '';
    var tipoComprobante = '';
    var puntoVenta = '';
    var nroComprobante = '';
    var fechaEmision = '';
    var importeTotal = '';
    var moneda = '';
    var caeAutorizacion = '';
    var titulo = '';

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
        return 'LeituraCustomizadaFacturaAR_QR_v2.js';
    }

    // ---------------------------------------------------------------
    // Carga dinámica de jsQR (librería pública, API documentada:
    // https://github.com/cozmo/jsQR). No depende de ninguna clase
    // interna de Dynamsoft sin documentar.
    // ---------------------------------------------------------------
    this.cargarJsQR = function (callback) {
        if (window.jsQR) {
            callback();
            return;
        }
        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
        script.onload = function () {
            console.log('jsQR cargado OK');
            callback();
        };
        script.onerror = function () {
            console.log('ERROR: no se pudo cargar jsQR desde el CDN.');
        };
        document.head.appendChild(script);
    }

    this.initCustomFunctionFacturaAR = function (nomeDocumento) {
        _this.cargarJsQR(function () {
            _this.ExtracaoInfoFacturaAR();
        });
    }

    this.ExtracaoInfoFacturaAR = function () {
        try {
            while (DWObject.CurrentImageIndexInBuffer < (DWObject.HowManyImagesInBuffer - 1)) {
                DWObject.CurrentImageIndexInBuffer = DWObject.HowManyImagesInBuffer - 1;
            }
            _this.GetImagenYDecodificar();
        } catch (ex) {
            console.log('ExtracaoInfoFacturaAR error: ' + ex);
            objSyncrosGlobal.FuncoesSatelites.hideLoading();
        }
    }

    this.GetImagenYDecodificar = function () {
        if (DWObject.HowManyImagesInBuffer == 0) {
            objSyncrosGlobal.InteracoesFluig.showToast({
                message: 'Ningún documento disponible para la operación.',
                type: "warning"
            });
            objSyncrosGlobal.FuncoesSatelites.hideLoading();
            return;
        }

        _this.IniciaValores();

        var arPagina = objSyncrosGlobal.FuncoesSatelites.doGetImageArrayForMultiPageDocuments(null);

        // Mismo método probado que usa el script original de estrelantares
        // para sacar la imagen actual del buffer de DWT.
        DWObject.ConvertToBase64([arPagina[0]], EnumDWT_ImageType.IT_PNG, function (result) {
            var length = result.getLength();
            var base64Png = result.getData(0, length);
            _this.DecodificarQrDesdeBase64(base64Png);
        }, function (errorCode, errorString, httpResponse) {
            console.log('Error en ConvertToBase64: ' + errorCode + ' ' + errorString);
            objSyncrosGlobal.FuncoesSatelites.hideLoading();
        }, '');
    }

    this.DecodificarQrDesdeBase64 = function (base64Png) {
        var img = new Image();
        img.onload = function () {
            try {
                var canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                var qrResult = window.jsQR(imageData.data, imageData.width, imageData.height);

                if (qrResult && qrResult.data && qrResult.data.indexOf('?p=') >= 0 &&
                    (qrResult.data.indexOf('afip.gob.ar') >= 0 || qrResult.data.indexOf('arca.gob.ar') >= 0)) {
                    _this.ParsearQrAfip(qrResult.data);
                } else {
                    console.log('No se detectó QR AFIP en la imagen. Resultado jsQR: ' + (qrResult ? qrResult.data : 'null'));
                }
            } catch (ex) {
                console.log('DecodificarQrDesdeBase64 error: ' + ex);
            }
            _this.AddItemAndTestForNext();
        };
        img.onerror = function () {
            console.log('No se pudo cargar la imagen base64 para decodificar el QR.');
            _this.AddItemAndTestForNext();
        };
        img.src = 'data:image/png;base64,' + base64Png;
    }

    // QR AFIP: https://www.afip.gob.ar/fe/qr/?p=<base64 de un JSON>
    // JSON: ver, fecha, cuit, ptoVta, tipoCmp, nroCmp, importe, moneda,
    // ctz, tipoDocRec, nroDocRec, tipoCodAut, codAut
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

            var ptoVtaPad = _this.puntoVenta ? _this.puntoVenta.padStart(4, '0') : '';
            var nroCmpPad = _this.nroComprobante ? _this.nroComprobante.padStart(8, '0') : '';
            _this.titulo = ptoVtaPad + '-' + nroCmpPad + ' (CAE ' + _this.caeAutorizacion + ')';

            console.log('QR AFIP decodificado OK:', datos);
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
            _this.GetImagenYDecodificar();
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

    this.AddItemJSonValoresOcr = function (index) {
        var valores = objSyncrosGlobal.valoresJson[index].values;

        console.log('DEBUG - Campos reales que Syncros espera:', Object.keys(valores));

        if (valores.hasOwnProperty('tituloFactura')) { valores.tituloFactura.value = this.titulo; }
        if (valores.hasOwnProperty('titulo')) { valores.titulo.value = this.titulo; }
        if (valores.hasOwnProperty('claveunica')) {
            var ptoVtaPad = _this.puntoVenta ? _this.puntoVenta.padStart(4, '0') : '';
            var nroCmpPad = _this.nroComprobante ? _this.nroComprobante.padStart(8, '0') : '';
            valores.claveunica.value = ptoVtaPad + '-' + nroCmpPad + '-' + _this.caeAutorizacion;
        }
        if (valores.hasOwnProperty('cuitproveedor')) { valores.cuitproveedor.value = this.cuitEmisor; }
        if (valores.hasOwnProperty('cuitemisor')) { valores.cuitemisor.value = this.cuitEmisor; }
        if (valores.hasOwnProperty('tipocomprobante')) { valores.tipocomprobante.value = this.tipoComprobante; }
        if (valores.hasOwnProperty('puntoventa')) { valores.puntoventa.value = this.puntoVenta; }
        if (valores.hasOwnProperty('nrocomprobante')) { valores.nrocomprobante.value = this.nroComprobante; }
        if (valores.hasOwnProperty('fechaemision')) { valores.fechaemision.value = this.fechaEmision; }
        if (valores.hasOwnProperty('importetotal')) { valores.importetotal.value = this.importeTotal; }
        if (valores.hasOwnProperty('moneda')) { valores.moneda.value = this.moneda; }
        if (valores.hasOwnProperty('caeautorizacion')) { valores.caeautorizacion.value = this.caeAutorizacion; }
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
