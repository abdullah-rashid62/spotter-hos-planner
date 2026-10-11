import { FileText, Info, Printer } from 'lucide-react';
import { clockTime, dayDate, duration, statuses } from '../lib/timeline';

const LEFT = 112;
const TOP = 38;
const HOUR = 27;
const ROW = 36;

export default function DailyLog({ trip, day, selectedId, onSelect, print = false }) {
  const selected = day.segments.find(segment => segment.id === selectedId);
  return <div className={`daily-log ${print ? 'print-log' : ''}`}>
    <div className="log-heading"><div><div className="eyebrow">RECORD OF DUTY STATUS · MOCK DATA</div><h3>Driver’s daily log</h3><p>{dayDate(trip.startDate, day.index, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · {trip.timezone}</p></div>{!print && <button className="button secondary" onClick={() => window.print()}><Printer size={15} /> Print all days</button>}</div>
    <div className="log-fields"><div><span>From</span><strong>{day.index === 0 ? 'Chicago, IL' : 'Chattanooga, TN'}</strong></div><div><span>To</span><strong>{day.index === 0 ? 'Chattanooga, TN' : 'Atlanta, GA'}</strong></div><div><span>Total miles driving today</span><strong>{Math.round(day.miles)} mi</strong></div><div><span>Driver / carrier / vehicle</span><strong className="unspecified">Not supplied</strong></div></div>
    <div className="log-scroll" tabIndex={0} role="region" aria-label="24-hour duty graph; scroll horizontally on small screens">
      <svg className="duty-graph" viewBox="0 0 844 200" aria-label={`Day ${day.index + 1} duty graph. ${duration(day.totals.driving)} driving.`}>
        <rect x={LEFT} y={TOP - 24} width={HOUR * 24} height="24" fill="#142338" />
        {Array.from({ length: 25 }, (_, hour) => <text key={hour} x={LEFT + hour * HOUR} y={TOP - 8} textAnchor="middle" className="hour-label" fill={hour === 0 || hour === 24 ? '#526175' : '#fff'}>{hour === 0 || hour === 24 ? 'M' : hour === 12 ? 'N' : hour % 12}</text>)}
        <text x="803" y={TOP - 8} textAnchor="middle" className="graph-total-heading">HOURS</text>
        {statuses.map((status, row) => <g key={status.id}>
          <rect x={LEFT} y={TOP + row * ROW} width={HOUR * 24} height={ROW} fill={row % 2 ? '#f8fafc' : '#fff'} stroke="#9daaba" strokeWidth="0.8" />
          <text x="3" y={TOP + row * ROW + 22} className="status-label">{row + 1}. {status.label}</text>
          <text x="803" y={TOP + row * ROW + 22} textAnchor="middle" className="graph-total">{duration(day.totals[status.id])}</text>
          {Array.from({ length: 97 }, (_, tick) => <line key={tick} x1={LEFT + tick * HOUR / 4} x2={LEFT + tick * HOUR / 4} y1={TOP + row * ROW} y2={TOP + row * ROW + (tick % 4 === 0 ? ROW : tick % 2 === 0 ? 12 : 6)} stroke="#b5bfcb" strokeWidth={tick % 4 === 0 ? 0.8 : 0.5} />)}
        </g>)}
        {day.segments.map((segment, index) => {
          const row = statuses.findIndex(status => status.id === segment.status);
          const y = TOP + row * ROW + ROW / 2;
          const x1 = LEFT + segment.start * HOUR;
          const x2 = LEFT + segment.end * HOUR;
          const previous = day.segments[index - 1];
          const previousRow = previous ? statuses.findIndex(status => status.id === previous.status) : row;
          const isSelected = segment.id === selectedId;
          return <g key={segment.id}>
            {previous && <line x1={x1} x2={x1} y1={TOP + previousRow * ROW + ROW / 2} y2={y} stroke="#142338" strokeWidth="2" />}
            <line x1={x1} x2={x2} y1={y} y2={y} stroke={isSelected ? '#2457d6' : '#142338'} strokeWidth={isSelected ? 5 : 2.5} strokeDasharray={segment.padding ? '4 3' : undefined} />
            {!print && !segment.padding && <line className="graph-hit" x1={x1} x2={x2} y1={y} y2={y} stroke="transparent" strokeWidth="22" role="button" tabIndex="0" aria-label={`${segment.title}, ${clockTime(segment.start)} to ${clockTime(segment.end)}`} aria-pressed={isSelected} onClick={() => onSelect(segment.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(segment.id); } }}><title>{segment.title}: {clockTime(segment.start)}–{clockTime(segment.end)}</title></line>}
          </g>;
        })}
      </svg>
    </div>
    <div className="log-totals">{statuses.map(status => <div key={status.id}><span><i style={{ background: status.color }} />{status.label}</span><strong>{duration(day.totals[status.id])}</strong></div>)}<div className="total-hours"><span>Total</span><strong>24h</strong></div></div>
    {selected && <div className="log-selection" role="status"><FileText size={16} /><span><strong>{selected.title}</strong> · {clockTime(selected.start)}–{clockTime(selected.end)} · {selected.location}</span></div>}
    <div className="remarks"><h4>Remarks</h4><div className="remark-grid">{day.segments.filter(segment => !segment.padding).map(segment => <button key={segment.id} className={segment.id === selectedId ? 'remark-selected' : ''} onClick={() => onSelect(segment.id)}><time>{clockTime(segment.start)}</time><span>{segment.title}<small>{segment.location}</small></span></button>)}</div></div>
    <p className="log-note"><Info size={14} /><span>Dashed segments assume off-duty time outside the trip. This sample sheet is for interface preview; driver identity, signature, and actual duty history are not supplied.</span></p>
  </div>;
}
