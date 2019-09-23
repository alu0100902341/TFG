	
	
	/** Constante que representa el servidor WMS de donde sacamos los datos */
	const WMSserver = "http://10.6.5.230:8080/ncWMS2/wms?"
	
	/** Hacemos una peitición GetCapabilities al servidor WMS */
	var x = new XMLHttpRequest();
	x.open("GET", WMSserver + "request=GetCapabilities&service=WMS/", true);
	
	/** Si la respuesta del servidor es exitosa procedemos a filtrar la respuesta para sacar solo la información que nos interesa
	 * En este caso solo nos interesan las capas de información climática. 
	 */
	x.onreadystatechange = function () {
		if (x.readyState == 4 && x.status == 200)
		{
			/** Guardamos la respuesta xml en xmlDoc. */
			var xmlDoc = x.responseXML;
			console.log("Response successful!");

			/** Obtenemos la información de las capas. */
			var layersInfo = xmlDoc.getElementsByTagName('Layer');

			/** En este array guardamos objetos correspondientes a las capas. Estos objetos guardarán la información importante como el name de la capa. */
			var AllQueryableLayersInfo = new Array();

			/** Primero recorremos todas las capas obtenidas en la respuesta.
			 * Luego filtramos y nos quedamos solo con las capas que pueden ser pedidas al servidor (queryable=1).
			 * Si la capa cumple lo anterior miramos si cumple con nuestro formato de nombre de capa (rcp[ 45|85 ]_año-año_variable).
			 * Si cumple con el formato del nombre procedemos a obtener los datos:
			 * 	- Nombre de la capa (layerName)
			 * 	- Título de la capa (layerTitle)
			 * 	- Resumen de la capa (layerAbstract)
			 * 	- Coordenadas de las esquinas de su límite (layerBounds)
			 * 	- El rango de tiempo en el que se desarrollan las variables (times)
			 * 	- Los estilos de la capa (styles) 
			*/
			for (i=0; i < layersInfo.length; ++i) {
				if(layersInfo[i].getAttribute('queryable')){
					if (layersInfo[i].querySelector("Name").innerHTML == "kkita1/T2MAX" || layersInfo[i].querySelector("Name").innerHTML.match(/rcp/)) {
						//console.log(layersInfo[i]);
						var layerName = layersInfo[i].querySelector("Name").innerHTML;
						var layerTitle = layersInfo[i].querySelector("Title").innerHTML;
						var layerAbstract = layersInfo[i].querySelector("Abstract").innerHTML;

						var westLong = layersInfo[i].querySelector("EX_GeographicBoundingBox").querySelector("westBoundLongitude").innerHTML;
						var northLat = layersInfo[i].querySelector("EX_GeographicBoundingBox").querySelector("northBoundLatitude").innerHTML;
						var eastLong = layersInfo[i].querySelector("EX_GeographicBoundingBox").querySelector("eastBoundLongitude").innerHTML;
						var southLat = layersInfo[i].querySelector("EX_GeographicBoundingBox").querySelector("southBoundLatitude").innerHTML;
						var layerBounds = [[northLat, westLong], [southLat, eastLong]];

						
						var times = layersInfo[i].querySelector('Dimension[name="time"]').innerHTML.replace(/(\r\n|\n|\r|\s)/gm, "");
						console.log(times);
						times = times.split(/(,|\/)/g);
						times = times.filter(function(time){
							if (!(/(,|\/|^[a-z|A-Z])/g).test(time)){
								return time;
							}
						});
						var styles = new Array();

						/** Por cada stilo que tenga la capa generamos un objeto con su leyenda asociada */
						layersInfo[i].querySelectorAll('Style').forEach(styleInfo => {
							var resource = "";
							if (styleInfo.querySelector('OnlineResource')) {
								resource = styleInfo.querySelector('OnlineResource').getAttribute('xlink:href');
							}
							var style = {
								name: styleInfo.querySelector("Name").innerHTML,
								title: styleInfo.querySelector("Title").innerHTML,
								abstract: styleInfo.querySelector("Abstract").innerHTML,
								legendURL: resource
							}
							styles.push(style);
						});

						var queryableLayerInfo = {
							name: layerName,
							title: layerTitle,
							abstract: layerAbstract,
							bound: layerBounds,
							times: times,
							styles: styles
						};

						AllQueryableLayersInfo.push(queryableLayerInfo);
					}

				}
			}

			/** Ahora procedemos al montaje de nuestro mapa con sus características
			 * Primero declaramos el mapa base con sus propiedades
			 * https://leafletjs.com/reference-1.5.0.html#map-option para ver las propiedades y lo que hacen.
			 * Hay ciertas propiedades como fullscreenControl que no aparecen en mapa. Eso significa que son opciones para habilitar plugins.
			 */

			var map = L.map('mapid', {
				crs: L.CRS.EPSG4326,
				center: [28.23, -15.64],
				scrollWheelZoom: false,
				zoom: 7,
				maxZoom: 6,
				minZoom: 8,
				maxBoundsViscosity: 1,
				maxBounds: AllQueryableLayersInfo[0].bound,
				zoomControl: false,
				scrollWheelZoom: false,
				doubleClickZoom: false,
				timeDimension: true,
				fullscreenControl: true,
				fullscreenControlOptions: {
					position: 'topleft'
				},
				timeDimensionControl: true,
				timeDimensionControlOptions:{
					timeSteps: 1,
					position: 'topright',
					autoplay: false,
					playReverseButton: true,
					playerOptions: {
						loop: false,
					},
					timeZones: ["Local", "UTC"]
				},
				selectArea: true,
				contextmenu: true,
			});

			/** Este array guarda las capas base con sus respectivo nombre.
			 * Para más información sobre el método L.tileLayer.wms y sus opciones https://leafletjs.com/reference-1.5.0.html#tilelayer-wms
			 */
			var baseLayers = new Array();
			baseLayers = [
				{
					name: "BaseMaps",
					layers: {
						'bluemarble': L.tileLayer.wms("http://godiva.reading.ac.uk/geoserver/ReSC/wms", {
							layers: 'bluemarble',
							format: 'image/png',
							transparent: true,
							opacity: 1
						}),
						'naturalearth': L.tileLayer.wms("http://godiva.reading.ac.uk/geoserver/ReSC/wms", {
							layers: 'naturalearth',
							format: 'image/png',
							transparent: true,
							opacity: 1
						}),
						'IGNBaseTodo': L.tileLayer.wms("http://www.ign.es/wms-inspire/ign-base", {
							layers: 'IGNBaseTodo',
							format: 'image/png',
							transparent: true,
							opacity: 1
						})
						
					}
				}
			]

			/** Este array guarda el nombre de los overLay con un array que contiene la capa usando los distintos estilos que posee la capa.
			 * L.timeDimension es un plugin de leaflet que nos permite observar el desarrollo temporal de las capas https://github.com/socib/Leaflet.TimeDimension
			 * ATENCIÓN: overLays y baseLayers tienen un formato de objeto similar pero no son iguales. En baseLayers tenemos el nombre del servidor y un array con las 
			 * capas de ese servidor por cada objeto del array, mientras que en overLays tenemos el nombre de la capa y un array con la misma capa usando distintos estilos.
			 */

			var overLays = new Array();
			AllQueryableLayersInfo.forEach(layer => {
				var layerName = layer.name;
				var overLayInfo = {
					name: layerName,
					styles: {}
				}
				var stylesInfo = layer.styles;
				stylesInfo.forEach(styleInfo => {
					var styleName = styleInfo.name;
					var styleLayer = L.tileLayer.wms(WMSserver, {
						layers: layerName,
						opacity: 1,
						format: 'image/png',
						styles: styleName,
						name: layerName
					});

					var tdWmsLayer = L.timeDimension.layer.wms(styleLayer, {
						setDefaultTime: true,
						grpName: layerName,
						updateTimeDimension: true,
						updateTimeDimensionMode: "intersect",
						times: layer.times

					});
					
					overLayInfo.styles[styleName] = tdWmsLayer;
				});
				overLays.push(overLayInfo);
			});
			
			/** Tanto este array como controlOverLays son arrays que guardan la información de las capas base y overlays (respectivamente)
			 * en un formato específico para poder ser utilizados por el plugin L.Control.styledLayerControl que nos permite extender L.Control
			 * para modificar su aspecto visual a voluntad.
			 */

			var controlBaseLayers = new Array();
			baseLayers.forEach(baseLayer => {
				controlBaseLayers.push({
					groupName: baseLayer.name,
					expanded: true,
					layers: baseLayer.layers
				});
			});

			var controlOverLays = new Array();
			var legends = new Object();
			overLays.forEach(overlay => {
				controlOverLays.push({
					groupName: overlay.name,
					expanded: true,
					layers: overlay.styles
				});
				/** Aprovechar la creación del array controlOverLays para asignar un control leyenda por capa . */
				
				var stylesLegends = new Object();
				var stylesKeys = Object.keys(overlay.styles);
				stylesKeys.forEach(stylekey => {
					stylesLegends[stylekey] = L.control({
						position: 'bottomright',
						collapsed: true
					});

					stylesLegends[stylekey].onAdd = function(map) {
						console.log("Obteniendo leyenda de: " + overlay.name + "(" + stylekey + ")");
	
						/** Peitición GetLegendGraphic 
						 * http://10.6.5.230:8080/ncWMS2/wms?
						 *  REQUEST=GetLegendGraphic
						 *  &VERSION=1.1.1
						 *  &FORMAT=image/png
						 *  &LAYERS=20190806/T2MIN
						 *  &STYLES=default-scalar/default
						 *  &PALETTE=default
						 * 
						 */
						var URL = 'http://10.6.5.230:8080/ncWMS2/wms?'+
							'REQUEST=GetLegendGraphic'+
							'&VERSION=1.1.1'+
							'&FORMAT=image/png'+
							'&LAYERS='+overlay.name+''+
							'&STYLES='+stylekey+''+
							'&PALETTE=default';
							
						var div = L.DomUtil.create('div', 'info legend');
						div.innerHTML += '<img id="legend" src=" '+URL+' " />';
						return div;
					};
					legends[overlay.name] = stylesLegends;
				});
				 

			});


			/** Opciones de configuración del conmutador estilizado de capas
			 * Con el atributo exclusive podemos decirle si solamente puede haber activo un overlay por grupo.
			 */
			var options = {
				container_maxwidth 	: "400px",
				container_maxHeight : "350px", 
				group_maxHeight     : "100px",
				exclusive       	: false
			};

			/** Variables globales que nos permiten mantener tracking de la capa base actual, los overlays activos y la leyenda actual */
			var actualBaseLayer = null;
			var activeLayers = L.featureGroup();
			var actualLegend = null;


			/** Generamos el control del conmutador estilizado y lo añadimos al mapa. */
			var control = L.Control.styledLayerControl(controlBaseLayers, controlOverLays, options);
			map.addControl(control);

			/** Generamos y añadimos al mapa el control que nos muestra la escala */
			L.control.scale({
				position: 'bottomright'
			}).addTo(map);

			/** Generamos y añadimos al mapa el control que nos muestra las coordenadas actuales de nuestro ratón.
			 * Este control proviene del plugin L.Control.MousePosition https://github.com/ardhi/Leaflet.MousePosition
			*/
			L.control.mousePosition({
				position: 'bottomleft'
			}).addTo(map);

			/** Generamos y añadimos el control L.Draw
			 * Para ver un ejemplo detallado de su funcionamiento ir a http://leaflet.github.io/Leaflet.draw/docs/leaflet-draw-latest.html
			 */
			var drawControl = new L.Control.Draw({
				draw: {
					polygon: false,
					marker:false,
					rectangle: false,
					circle: false, 
					circlemarker: false
				},
				edit: false
			}).addTo(map);

			/** Sobreescribimos el evento CREATED de L.Draw para que cuando se dibuje una polilínea se pida la petición GetTransect
			 * Petición GetTransect
			 * http://10.6.5.230:8080/ncWMS2/wms?
			 * LAYERS=rcp45_70-99_t2min_miroc/T2MIN
			 * &QUERY_LAYERS=rcp45_70-99_t2min_miroc/T2MIN
			 * &LINESTRING=-16.417694091796875%2028.370819091796875,-13.745269775390625%2028.645477294921875,-15.612945556640625%2029.073944091796875,-14.198455810546875%2028.247222900390625
			 * &SERVICE=WMS
			 * &CRS=CRS:84
			 * &VERSION=1.1.1
			 * &REQUEST=GetTransect
			 * &HEIGHT=843
			 * &WIDTH=1231
			 * */ 
			map.on(L.Draw.Event.CREATED, function (e) {
				var type = e.layerType;
				if (type === 'polyline' && activeLayers.getLayers().length) {

					/** Solo generamos el transecto de la última capa añadida.
					 * Si se quiere extrapolar y hacerlo de todas ellas habría que hacerlo por medio de un bucle pues la petición GetTransect no permite
					 * varias QUERY_LAYERS .
					 */
					var layer = activeLayers.getLayers()[activeLayers.getLayers().length - 1];
					var LAYER = layer.options.grpName;
					var VERSION = layer._baseLayer.wmsParams.version? layer._baseLayer.wmsParams.version:'1.1.1';
					console.log(layer);
					var LINESTRING;
	
					var line = e.layer._latlngs;
					var LINESTRING = "";
					line.forEach(coord => {
						var coord_str = coord.lng + ' ' + coord.lat + ',';
						LINESTRING = LINESTRING + coord_str;
					});
	
					 var URL = WMSserver+
					 'LAYERS='+LAYER+'' +
					 '&QUERY_LAYERS='+LAYER+'' +
					 '&LINESTRING='+LINESTRING+'' +
					 '&SERVICE=WMS' +
					 '&CRS=CRS:84' +
					 '&VERSION='+VERSION+'' +
					 '&REQUEST=GetTransect' +
					 '&HEIGHT=600' +
					 '&WIDTH=800' +
					 '&FORMAT=image/png';

					 window.open(URL);
				}
			 });


			/** Botones controles para administrar la opacidad de los overlays. */ 
			var lowOpacityButton = L.easyButton( '<span class="icon">&frac14;</span>', function(controlArg, mapArg){
				console.log("Setting all active layers opacity to 0.25.");
				activeLayers.eachLayer(function(layer){
					layer.setOpacity(0.25);
				});
			  }, 'Opacity 25%').addTo(map);

			  var mediumOpacityButton = L.easyButton( '<span class="icon">&frac12;</span>', function(controlArg, mapArg){
				console.log("Setting all active layers opacity to 0.5.");
				activeLayers.eachLayer(function(layer){
					layer.setOpacity(0.5);
				});
			  }, 'Opacity 50%').addTo(map);

			  var highOpacityButton = L.easyButton( '<span class="icon">&frac34;</span>', function(controlArg, mapArg){
				console.log("Setting all active layers opacity to 0.75.");
				activeLayers.eachLayer(function(layer){
					layer.setOpacity(0.75);
				});
			  }, 'Opacity 75%').addTo(map);


			  var fullOpacityButton = L.easyButton( '<span class="icon" style="font-size:2.5em;position:absolute;top:25%;left:20%">&sup1;</span>', function(controlArg, mapArg){
				console.log("Setting all active layers opacity to opaque.");
				activeLayers.eachLayer(function(layer){
					layer.setOpacity(1);
				});
			  }, 'Opacity 100%').addTo(map);

			  /** Botón control para limpiar todas las capas activas en el mapa */
			  var clearLayers= L.easyButton( '<span class="icon"">&Scy;</span>', function(controlArg, mapArg){
				console.log("Clearing map from layers.");
				if (activeLayers.getLayers().length){
					activeLayers.eachLayer(function(layer){
						map.removeLayer(layer);
					});
					activeLayers.clearLayers();
				}
			  }, 'Clear layers').addTo(map);

			  /** Botón control para limpiar todas los polígonos en el mapa */
			  var clearPolygons= L.easyButton( '<span class="icon">&marker;</span>', function(controlArg, mapArg){
				console.log("Clearing map from polygons.");
				polygons.forEach(rect => {
					map.removeLayer(rect);
				});
				polygons=[];

			  }, 'Clear Polygons').addTo(map);


/** Cosas al tener en cuenta al pedir getFeatures al WMS:
 * 	- El valor de LAYERS da igual mientras sea una capa del servidor con queryable=1
 *  - El valor de STYLES no repercute en el valor del pixel, ergo se puede omitir.
 * 	- Al valor de TIMES es engañoso.
 * 		Si pedimos un tiempo y todas las capas presentes en QUERY_LAYERS tienen dicho tiempo se devolverá el valor del pixel y el tiempo.
 * 		Si pedimos un tiempo y no todas las capas presentes en QUERY_LAYERS tienen dicho tiempo se devolverá error de que la capa X no tiene ese tiempo.
 * 		Si pedimos tiempos separados por comas se ignorarán y se devolverán los valores de los pixeles de las capas en su tiempo predeterminado.
 * 		Si pedimos un rango (dividir fechas con /) se aplicará la fecha mayor a todas las capas. Si hay alguna capa que no contenga dicha fecha dará error. 
 * 		Da igual cuantos tiempos tenga el rango, siempre se coge el segundo tiempo.
 			 * 	Peitición GetFeatureInfo
 			 *	http://10.6.5.230:8080/ncWMS2/wms?
			 *  LAYERS=rcp85_70-99_winds%2FU10%3AV10-mag
			 *  &QUERY_LAYERS=rcp85_70-99_winds%2FU10%3AV10-mag
			 *  &STYLES=default-scalar%2Fdefault
			 *  &SERVICE=WMS
			 *  &VERSION=1.1.1
			 *  &REQUEST=GetFeatureInfo
			 *  &BBOX=-20.0135%2C24.987701%2C-12.0215%2C31.381301
			 *  &FEATURE_COUNT=5
			 *  &HEIGHT=600
			 *  &WIDTH=750
			 *  &FORMAT=image%2Fpng
			 *  &INFO_FORMAT=text%2Fxml
			 *  &SRS=EPSG%3A4326
			 *  &X=276
			 *  &Y=259
			 *  &TIME=2099-01-31T10%3A00%3A00.000Z
 */
			/** Función para generar la URL de las peticiones GetFeatureInfo y GetTimeseries */
			function get(latLangPoint, request) {
				
				var layerPoint = map.latLngToLayerPoint(latLangPoint);
				var containerPoint = map.layerPointToContainerPoint(layerPoint);

				var layer = activeLayers.getLayers()[0];
				var LAYER = layer.options.grpName;
				QUERY_LAYERS = layer.options.grpName;
				var VERSION = layer._baseLayer.wmsParams.version? layer._baseLayer.wmsParams.version:'1.1.1';
				var BBOX = map.getBounds()._southWest.lng + ',' + map.getBounds()._southWest.lat + ',' + map.getBounds()._northEast.lng + ',' + map.getBounds()._northEast.lat;
				var HEIGHT = map.getSize().y;
				var WIDTH = map.getSize().x;
				var FORMAT = layer._baseLayer.options.format? layer._baseLayer.options.format:'';
				var SRS = layer._baseLayer.wmsParams.srs? layer._baseLayer.wmsParams.srs:'EPSG:4326';
				var X = Math.trunc(containerPoint.x);
				var Y = Math.trunc(containerPoint.y);
				var TIME = layer._baseLayer.options.time? layer._baseLayer.options.time:'';

				 activeLayers.eachLayer(function(layer){
					var layerName = layer.options.grpName;
					var regexp = new RegExp(',?'+layerName+'+(,|$|&)');
					QUERY_LAYERS = QUERY_LAYERS.match(regexp) ? QUERY_LAYERS:(QUERY_LAYERS +','+ layer.options.grpName);
				 });

				 var REQUEST = "GetFeatureInfo";
				 INFO_FORMAT = "text/xml";

				 if (request == "GetTimeseries") {
					REQUEST = request;
					TIME="";
					INFO_FORMAT = "image/png";
				 }

				 var URL = WMSserver+
				 'LAYERS='+LAYER+'' +
				 '&QUERY_LAYERS='+QUERY_LAYERS+'' +
				 '&STYLES=' +
				 '&SERVICE=WMS' +
				 '&VERSION='+VERSION+'' +
				 '&REQUEST='+REQUEST+'' +
				 '&BBOX='+BBOX+'' +
				 '&FEATURE_COUNT=10' +
				 '&HEIGHT='+HEIGHT+'' +
				 '&WIDTH='+WIDTH+'' +
				 '&FORMAT='+FORMAT+'' +
				 '&INFO_FORMAT='+INFO_FORMAT+'' +
				 '&SRS='+SRS+'' +
				 '&X='+X+'' +
				 '&Y='+Y+'' +
				 '&TIME='+TIME+'';

				return URL;
				
			};

			/** Declaración del PopUp utilizado en map.on('click') para representar la respuesta de GetFeatureInfo */
			popup = new L.Popup({
				 maxHeight: 500,
				 maxWidth: 500
			});

			/** Sobreescribimos el evento 'click' de mapa para que cuando lo invoquemos se haga la peitición GetFeatureInfo y se muestre la respuesta
			 * en un PopUp
			*/
			map.on('click', function(e){
				if (activeLayers.getLayers().length) {
					var URL='';
					URL = get(e.latlng);

					if(URL) {

						var resource = new XMLHttpRequest();
						resource.open("GET", URL, true);
						resource.onreadystatechange = function () {
							if (resource.readyState == 4 && resource.status == 200)
							{
								/** Guardamos la respuesta xml en xmlDoc. */
								var xml = resource.responseXML;
								console.log("Response successful!");
		
								var longitude = xml.querySelector('longitude').innerHTML;
								var latitude = xml.querySelector('latitude').innerHTML;
								var features = xml.querySelectorAll('Feature');
								console.log(features);
								
								if (features.length) {
									var htmltable = '';
									console.log(e);
									features.forEach(feature => {
										console.log(feature);
										var layer = feature.querySelector("layer")? feature.querySelector("layer").innerHTML:e.name;
										var featureInfo = feature.querySelector("FeatureInfo");
										var id = featureInfo.querySelector("id").innerHTML;
										var time = featureInfo.querySelector("time").innerHTML;
										var value = featureInfo.querySelector("value").innerHTML;
										
										htmltable = htmltable + 
										'<tr>' + 
											'<td>'+layer+'</td>' + '<td>'+id+'</th>' + '<td>'+time+'</td>' + '<td>'+value+'</td>' +
										'</td>';
										
									});
									
									var GetTimeSeries = get(e.latlng, "GetTimeseries");

									var html = '<h3>Información capas activas</h3>'+
									'<table>'+
									'<tr>'+
										'<th>Longitud:</th>' + '<td>'+longitude+'</td>' + '<th>Latitud:</th>' + '<td>'+latitude+'</td>' +
									'</tr>' +
									'<tr>'+
										'<th>Capa</th>' + '<th>ID</th>' + '<th>Tiempo</th>' + '<th>Valor</th>' +
									'</tr>' +
										htmltable +
									'</table>'+
									'<a href="'+GetTimeSeries+'" target="_blank">Gráfico temporal para este punto</a>';
		

									var template = document.createElement('table');
									html = html.trim();
									template.innerHTML = html;
									popup.setLatLng(e.latlng);
									popup.setContent(template);
									map.openPopup(popup);
								}
								
							}
						};
						resource.send();
					}
				 }
			});

			/** Sobreescribimos el evento baselayerchange, que se invoca cuando cambia el mapa base activo, para cambiar el valor de
			 * actualBaseLayer a la nueva capa
			 */
			map.on('baselayerchange', function (e) {
				actualBaseLayer = e;
				console.log("La capa base actual ahora es -> " + actualBaseLayer.name)
			});

			/** Sobreescribimos el evento  overlayremove, que se invoca cuando deseleccionamos un overlay del conmutador de capas, para que elimine
			 * esa capa del array de capas activas activeLayers y cambie la leyenda actual por la de la última capa añadida
			*/
			map.on('overlayremove', function(e) {
				console.log("Eliminando overlay ->" + e.group.name+'('+e.name+')');
				activeLayers.removeLayer(e.layer);
				console.log(legends[e.group.name][e.name]);
				console.log("Eliminando leyenda ->"+ e.group.name+'('+e.name+')');
				map.removeControl(actualLegend);
				if (activeLayers.getLayers().length){
					var lastAddedLayer = activeLayers.getLayers()[activeLayers.getLayers().length - 1];
					var resource = legends[lastAddedLayer._baseLayer.options.name][lastAddedLayer._baseLayer.options.styles];
					actualLegend = resource;
					resource.addTo(map);
				}else{
					actualLegend = null;
				}
				
			});

			/** Sobreescribimos el evento overlayadd, que se invoca cuando seleccionamos un overlay en el conmutador de capas, para que se añada ese overlay
			 * al array de capas activas.
			 * También comprueba si los tiempos de la capa que vamos a activar son compatibles con las capas actualmente activas. Si lo se se permite la adición.
			 * Si no se deniega.
			 */
			map.on('overlayadd', function(e) {

					var timesBelongs = true;
					if (activeLayers.getLayers().length) {
						
						var availableTimesIn = e.layer._availableTimes;
						var i = 0;
						var j = 0;
						var availableTimes = new Array();
						do{
							availableTimes = activeLayers.getLayers()[j]._availableTimes;
							do{
								timesBelongs = availableTimes.includes(availableTimesIn[i]);
								++i;
							}while(timesBelongs && i < availableTimesIn.length);
							i=0;
							++j;
						}while(timesBelongs && j < activeLayers.getLayers().length);

					}

					if (timesBelongs) {
						console.log("Tiempos compatibles. Añadiendo overlay.");
						activeLayers.addLayer(e.layer);
						console.log('Añadiendo recurso para la capa '+e.group.name+' con estilo '+e.name);
						console.log(legends[e.group.name][e.name]);
						var resource = legends[e.group.name][e.name];
						
						if (actualLegend == null) {
							resource.addTo(map);
							actualLegend = resource;
						}else{
							map.removeControl(actualLegend);
							actualLegend = resource;
							resource.addTo(map);
						}
						
						console.log('Capas activas ahora = ');
						console.log(activeLayers.getLayers());
					}else{
						console.log("Los tiempos no son compatibles.");
						map.removeLayer(e.layer);
						
					}

			});

			/** Sobreescribimos el evento que se invoca cuando seleccionamos un área con el plugin AreaSelect para que haga
			 * genere las coordenadas de interés,
			 * haga las peticiones GetFeatureInfo por cada coordenada
			 * y formatee la respuesta en la tabla
			 */
			var polygons = new Array();
			map.on('areaselected', function(e) {
				if (activeLayers.getLayers().length){
					console.log(e);

					var areaSelected = L.rectangle(e.bounds, {});
					areaSelected.addTo(map);
					polygons.push(areaSelected);
					var puntos = areaSelected.getLatLngs()[0];
					var northWest = puntos[1];
					var southWest = puntos[0];
					var northEast = puntos[2];
					var southEast = puntos[3];
					var Center = areaSelected.getCenter();
					var midNorth = L.latLng(northWest.lat, Center.lng);
					var midWest = L.latLng(Center.lat, northWest.lng);
					var midSouth = L.latLng(southWest.lat, Center.lng);
					var midEast = L.latLng(Center.lat, northEast.lng);
	
					var pointsOfInterest = [
						northWest, southWest, northEast, southEast, Center, midNorth, midWest, midSouth, midEast
					];
					
					// Get the modal
					var modal = document.getElementById("myModal");
					var span = document.getElementsByClassName("close")[0];
					var table = document.getElementById("table");
					var title = document.getElementById("title");
					title.innerHTML = 'Pixeles dentro del área';
					
					/** Ocultar el modal cuando se se hace click en la x. */
					span.onclick = function() {
						modal.style.display = "none";
						title.innerHTML='';
						table.innerHTML='';
					}
					/** Ocultar el modal cuando se se hace click fuera de él. */
					window.onclick = function(event) {
						if (event.target == modal) {
							modal.style.display = "none";
							title.innerHTML='';
							table.innerHTML='';
						}
					}
	
					table.innerHTML = table.innerHTML + 
						'<tr>'+
							'<th style="text-align: center; background-color: #dddddd">ID</th><th>Tiempo</th><th>Valor</th>'+
						'</tr>';
	
	
					/** Lanzamos todos los procedimientos asíncronos y con forEach hacemos que cuando vuelva añada el grupo html a nuestra tabla. */
					var asyncTracking = 0;
					console.log(pointsOfInterest);
					pointsOfInterest.forEach(point => {
						var URL='';
						URL = get(point, "GetFeatureInfo");
						if(URL){

							/** Variables acumuladoras para poder sacar la media
							 * acc se encarga de acumular todos los valores de los pixeles por característica de capa en cada coordenada
							 * num_elem cuenta todos los valores totales. Sería igual a (nº de coordenadas)x(nº características), pero en nuestro caso
							 * pueden haber caraterísticas repetidas por tener capas compuestas. Por esto mismo es mejor utilizarlo como contador.
							 */
							var acc = 0;
							var num_elem = 0;

							console.log(URL);
							var resource = new XMLHttpRequest();
							resource.open("GET", URL, true);
							resource.onreadystatechange = function () {
								if (resource.readyState == 4 && resource.status == 200)
								{
									console.log("Response successful!");

									/** Guardamos la respuesta xml en xmlDoc. */
									var xml = resource.responseXML;
									
									var longitude = xml.querySelector('longitude').innerHTML;
									var latitude = xml.querySelector('latitude').innerHTML;
									var featuresInfo = xml.querySelectorAll('FeatureInfo');
	
									rowHtml = 
									'<tr>'+
										'<th colspan="3" style="text-align: center; background-color: #dddddd">('+latitude+','+longitude+')</th>'+
									'</tr>';
									
										/** Este array nos ayuda a llevar el rastro de las características que hemos ido añadiendo.
										 * Esto es importante porque en el servidor WMS existen capas conjuntas que llevan todas las características
										 * de capas más pequeñas. Esto sería ideal solucionarlo en el servidor debido a que interpreto cada estilo de capa
										 * como una capa individual para poder ver el efecto conjunto visual de aplicar todos los estilos. Los estilos no repercuten en
										 * los valores de los píxeles, ergo es bueno controlar lo que procesamos para evitar redundancia de datos. En el evento 'click'
										 * nos da igual debido a que se diferencian por su nombre de capa, pero aquí, al utilizar los datos para medias, es imperativo mantener
										 * lo máximo la veracidad.
										 */
									var ids = new Array();
									featuresInfo.forEach(featureInfo => {
										var id = featureInfo.querySelector("id").innerHTML;
										if (!ids.includes(id)) {
											ids.push(id);
											var time = featureInfo.querySelector("time").innerHTML;
											var value = parseFloat(featureInfo.querySelector("value").innerHTML);
											acc+=value;
											++num_elem;
											rowHtml = rowHtml +
											'<tr>'+
												'<td>'+id+'</td><td>'+time+'</td><td>'+value+'</td>'+
											'</tr>';
										}
										
									});
										table.innerHTML = table.innerHTML + rowHtml;
										if(asyncTracking == pointsOfInterest.length-1) {
											console.log("Todas las peticiones han terminado correctamente.");
											modal.style.display = 'block';
											var average = acc / num_elem;
											console.log(acc + '/' + num_elem + '='+ average);
											table.innerHTML = table.innerHTML + 
											'<tr>'+
												'<th colspan=2 style="text-align: center;"">Media de todos los valores: </th>'+'<th style="text-align: center; background-color: #dddddd">'+average+'</th>'
											'</tr>';

										}
										++asyncTracking;
									
								}
									
							};
							resource.send();
						}
					});
	
	
				}
			});
		}
	};
	x.send();