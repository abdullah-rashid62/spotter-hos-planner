import { ArrowUpRight, Coffee, Flag, Fuel, MapPin, Moon, Package, Truck } from 'lucide-react';
import { clockTime, duration } from '../lib/timeline';

export const activityIcons = { drive: Truck, pickup: Package, fuel: Fuel, daily_rest: Moon, dropoff: Flag, driving_break: Coffee };

export default function Itinerary({ trip, day, selectedId, onSelect, onMap }) {
  const segments = day.segments.filter(segment => !segment.padding);
  return <div className="itinerary">
    <div className="itinerary-heading"><div><h3>Your day on the road</h3><p>Every drive, stop, and well-earned rest.</p></div><span className="quiet-tag">{segments.length} activities</span></div>
    <div className="event-list">{segments.map((event, index) => {
      const Icon = activityIcons[event.activity] || Coffee;
      const selected = event.id === selectedId;
      return <article key={event.id} className={`event-row ${selected ? 'selected' : ''} status-${event.status}`}>
        <div className="event-time"><strong>{clockTime(event.start)}</strong><span>{clockTime(event.end)}</span></div>
        <div className="event-track"><span className="event-icon"><Icon size={17} /></span>{index < segments.length - 1 && <span className="track-line" />}</div>
        <div className="event-content"><button className="event-title" aria-expanded={selected} onClick={() => onSelect(selected ? null : event.id)}>{event.title}<span className="event-duration">{duration(event.end - event.start)}</span></button><p>{event.location}</p>
          {selected && <div className="event-detail"><p>{event.detail}</p><button onClick={() => onMap(event.id)}><MapPin size={13} /> View on map <ArrowUpRight size={13} /></button></div>}
        </div><span className="event-mileage">{event.miles > 0 ? `${Math.round(event.miles)} mi` : event.status === 'off_duty' ? 'Off duty' : 'On duty'}</span>
      </article>;
    })}</div>
    <div className="day-end"><span className="small-dot" />{day.index === 0 ? 'Rest continues into the next day. Your daily log splits at midnight.' : 'You’ve arrived. Unload, wrap up, and enjoy the road behind you.'}</div>
  </div>;
}
