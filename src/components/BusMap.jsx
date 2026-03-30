import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet's default icon broken by Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom bus icon
const busIcon = L.divIcon({
  html: `<div style="font-size:28px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))">🚌</div>`,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// Component to pan map when bus moves
function MapPanner({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.panTo(position, { animate: true, duration: 0.5 });
  }, [position]);
  return null;
}

export default function BusMap({ location, busName }) {
  // Default center: your college coordinates — replace these
  const defaultCenter = [18.5204, 73.8567]; // Pune example — change to your college lat/lng

  const position = location ? [location.lat, location.lng] : null;

  return (
    <MapContainer
      center={position || defaultCenter}
      zoom={15}
      style={{ height: '260px', width: '100%', borderRadius: '16px' }}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {position && (
        <>
          <MapPanner position={position} />
          <Marker position={position} icon={busIcon}>
            <Popup>{busName || 'Bus'} · {location.speed} km/h</Popup>
          </Marker>
        </>
      )}
    </MapContainer>
  );
}
