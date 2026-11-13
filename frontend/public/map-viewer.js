// Surfaces any failure directly on the page instead of a silent blank/
// black screen - this page is viewed inside an Android WebView with no
// console/devtools access, so a visible message is the only diagnostic
// available without a USB-debugging setup.
function showError(message) {
  document.getElementById('map').outerHTML = '<div id="empty">' + message + '</div>';
}

window.addEventListener('error', function (event) {
  showError('Map script error: ' + (event.message || 'unknown'));
});

function haversineKm(lat1, lon1, lat2, lon2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingCompass(lat1, lon1, lat2, lon2) {
  var y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  var x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  var degrees = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  var directions = ['North', 'Northeast', 'East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest'];
  return directions[Math.round(degrees / 45) % 8];
}

try {
  var params = new URLSearchParams(window.location.search);
  var lat = parseFloat(params.get('lat'));
  var lon = parseFloat(params.get('lon'));
  var wantsRoute = params.get('route') === '1';

  if (isNaN(lat) || isNaN(lon)) {
    showError('No location available.');
  } else if (typeof L === 'undefined') {
    // Leaflet is self-hosted, but keep the location visible even if it fails:
    // Google's viewer does not need it.
    document.getElementById('google').src =
      'https://maps.google.com/maps?q=' + lat + ',' + lon + '&hl=en&z=19&t=k&output=embed';
    document.getElementById('viewBar').style.display = 'none';
    document.getElementById('map').style.display = 'none';
  } else {
    var map = L.map('map').setView([lat, lon], 15);
    var tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    tiles.on('tileerror', function () {
      showError('Map tiles failed to load. Check the phone\'s internet connection.');
    });
    L.marker([lat, lon]).addTo(map).bindPopup('Device location').openPopup();

    // Google's own embeddable viewer is the default so this window shows
    // Google imagery without handing off to an external Maps app. Tactical
    // keeps the Leaflet map for live route tracking (and as a fallback when
    // Google frames are blocked on the device's network).
    var googleFrame = document.getElementById('google');
    var googleWrap = document.getElementById('googleWrap');
    var viewBar = document.getElementById('viewBar');
    var trackBar = document.getElementById('trackBar');
    var trackingAvailable = wantsRoute && !!navigator.geolocation;

    function googleUrl(kind) {
      return 'https://maps.google.com/maps?q=' + lat + ',' + lon + '&hl=en&z=19&t=' +
        (kind === 'sat' ? 'k' : 'm') + '&output=embed';
    }

    function setView(view) {
      var googleOn = view === 'sat' || view === 'road';
      googleWrap.style.display = googleOn ? 'block' : 'none';
      if (googleOn) googleFrame.src = googleUrl(view);
      trackBar.style.display = trackingAvailable && view === 'tactical' ? 'block' : 'none';
      Array.prototype.forEach.call(viewBar.querySelectorAll('[data-view]'), function (btn) {
        btn.classList.toggle('active', btn.getAttribute('data-view') === view);
      });
      if (!googleOn) map.invalidateSize();
    }

    Array.prototype.forEach.call(viewBar.querySelectorAll('[data-view]'), function (btn) {
      btn.addEventListener('click', function () { setView(btn.getAttribute('data-view')); });
    });

    if (wantsRoute && navigator.geolocation) {
      var originIcon = L.icon({
        iconUrl: '/vendor/leaflet/images/marker-icon.png',
        iconRetinaUrl: '/vendor/leaflet/images/marker-icon-2x.png',
        shadowUrl: '/vendor/leaflet/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
        className: 'hue-rotate-[220deg]'
      });

      var originMarker = null;
      var routeLine = null;
      var routeInfoEl = null;
      var lastRouteFetchPos = null;
      var watchId = null;
      // Recalculating the route is a network call, so it's only
      // re-triggered once the live position has moved meaningfully -
      // otherwise every GPS tick (which jitters by tens of meters even
      // standing still) would hammer the routing API, same threshold as
      // the web dashboard's LiveTracker.
      var ROUTE_REFETCH_THRESHOLD_KM = 0.15;

      function setRouteInfo(text) {
        if (!routeInfoEl) {
          routeInfoEl = document.createElement('div');
          routeInfoEl.id = 'routeInfo';
          document.body.appendChild(routeInfoEl);
        }
        routeInfoEl.textContent = text;
      }

      function fetchRoute(originLat, originLon) {
        var url = 'https://router.project-osrm.org/route/v1/driving/' + originLon + ',' + originLat + ';' + lon + ',' + lat + '?overview=full&geometries=geojson';
        fetch(url)
          .then(function (response) { return response.ok ? response.json() : null; })
          .then(function (body) {
            var route = body && body.routes && body.routes[0];
            if (!route) return;
            var points = route.geometry.coordinates.map(function (c) { return [c[1], c[0]]; });
            if (routeLine) routeLine.remove();
            routeLine = L.polyline(points, { color: '#7ed957', weight: 5, opacity: 0.9 }).addTo(map);
            map.fitBounds(L.latLngBounds([[lat, lon], [originLat, originLon]]), { padding: [32, 32] });
            var km = (route.distance / 1000).toFixed(1);
            var min = Math.round(route.duration / 60);
            setRouteInfo(km + ' km · ' + min + ' min drive');
          })
          .catch(function () { /* route is a bonus - the distance/heading text below still works without it */ });
      }

      function handlePosition(position) {
        var originLat = position.coords.latitude;
        var originLon = position.coords.longitude;

        if (originMarker) {
          originMarker.setLatLng([originLat, originLon]);
        } else {
          originMarker = L.marker([originLat, originLon], { icon: originIcon }).addTo(map).bindPopup('You are here');
        }

        var distanceKm = haversineKm(originLat, originLon, lat, lon);
        var distanceText = distanceKm < 1 ? Math.round(distanceKm * 1000) + ' m' : distanceKm.toFixed(1) + ' km';
        document.getElementById('trackStatus').textContent = distanceText + ' away, heading ' + bearingCompass(originLat, originLon, lat, lon);

        var moved = !lastRouteFetchPos || haversineKm(lastRouteFetchPos.lat, lastRouteFetchPos.lon, originLat, originLon) > ROUTE_REFETCH_THRESHOLD_KM;
        if (moved) {
          lastRouteFetchPos = { lat: originLat, lon: originLon };
          fetchRoute(originLat, originLon);
        }
      }

      function stopTracking() {
        if (watchId !== null) {
          navigator.geolocation.clearWatch(watchId);
          watchId = null;
        }
        if (originMarker) { originMarker.remove(); originMarker = null; }
        if (routeLine) { routeLine.remove(); routeLine = null; }
        if (routeInfoEl) { routeInfoEl.remove(); routeInfoEl = null; }
        lastRouteFetchPos = null;
        document.getElementById('trackStatus').textContent = '';
        document.getElementById('trackButton').textContent = 'Track my location live';
        document.getElementById('trackButton').classList.remove('tracking');
      }

      function startTracking() {
        document.getElementById('trackButton').textContent = 'Finding your location…';
        watchId = navigator.geolocation.watchPosition(handlePosition, function (err) {
          document.getElementById('trackStatus').textContent = err.code === err.PERMISSION_DENIED ? 'Location permission denied.' : 'Could not get your location.';
        }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
        document.getElementById('trackButton').textContent = 'Stop live tracking';
        document.getElementById('trackButton').classList.add('tracking');
      }

      document.getElementById('trackBar').style.display = 'block';
      document.getElementById('trackButton').addEventListener('click', function () {
        if (watchId !== null) stopTracking(); else startTracking();
      });
    }

    // Route mode opens on the tactical map so the tracking control is
    // immediately usable; a plain "view on map" opens on Google satellite.
    setView(trackingAvailable ? 'tactical' : 'sat');
  }
} catch (error) {
  showError('Map failed to load: ' + (error && error.message ? error.message : error));
}