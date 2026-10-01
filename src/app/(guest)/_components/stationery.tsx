import { useId } from 'react';
import { scriptOf } from '@/lib/domain/script';

type Names = { brideName: string; groomName: string };

function initial(name: string) {
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name.trim()))[0]?.segment ?? '';
}

/** Live initials keep the stationery in step with the configured couple. */
export function Monogram({ brideName, groomName }: Names) {
  return (
    <div className="stationery-monogram" aria-hidden="true" data-script={scriptOf(brideName + groomName)}>
      <span>{initial(brideName)}</span><span>{initial(groomName)}</span>
      <svg className="monogram-sprig" viewBox="0 0 80 36" fill="none" focusable="false">
        <path d="M12 30Q37 29 67 5M30 26Q18 16 20 13Q33 14 35 23M43 19Q32 7 35 5Q47 9 48 15M45 19Q58 21 65 16Q56 12 51 15M25 28Q32 35 42 30Q36 24 31 26" stroke="currentColor" strokeWidth=".8" />
      </svg>
    </div>
  );
}

/** Two independently transformable wax halves, with static bevel lighting. */
export function WaxSeal({ brideName, groomName }: Names) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false" className="wax-art">
      <defs>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f5e4b2" /><stop offset=".22" stopColor="#c6a568" />
          <stop offset=".48" stopColor="#eee0b3" /><stop offset=".7" stopColor="#9e793c" />
          <stop offset="1" stopColor="#d6b779" />
        </linearGradient>
        <radialGradient id={`${id}-wax`} cx=".32" cy=".23" r=".85">
          <stop stopColor="#e9d59f" /><stop offset=".5" stopColor="#ceb078" /><stop offset="1" stopColor="#ac8449" />
        </radialGradient>
        <clipPath id={`${id}-left`}><path d="M0 0H60L58 19 62 30 58 41 61 51 57 63 62 76 58 88 61 101 60 120H0Z" /></clipPath>
        <clipPath id={`${id}-right`}><path d="M60 0H120V120H60L61 101 58 88 62 76 57 63 61 51 58 41 62 30 58 19Z" /></clipPath>
        <g id={`${id}-disc`}>
          <path d="M60 8C72 5 78 13 88 16S102 27 106 39 109 57 108 68 102 88 92 98 73 109 60 110 39 105 27 100 13 82 10 70 7 48 13 35 22 20 34 13 47 10 60 8Z" fill={`url(#${id}-rim)`} stroke="#a5824b" strokeWidth=".7" />
          <circle cx="60" cy="59" r="43.5" fill="none" stroke="#f4e3b2" strokeWidth="2.8" />
          <circle cx="60" cy="61" r="39.5" fill={`url(#${id}-wax)`} stroke="#98703a" strokeWidth="1.5" />
          <circle cx="60" cy="59" r="37.5" fill="none" stroke="#efdda9" strokeWidth=".65" />
          <text x="60" y="72" textAnchor="middle" className="wax-initials" data-script={scriptOf(brideName + groomName)}>{initial(brideName)}{initial(groomName)}</text>
          <path d="M25 39A40 40 0 0 1 65 19" fill="none" stroke="#fff0c6" strokeWidth="2" strokeLinecap="round" opacity=".8" />
        </g>
      </defs>
      <g id={`${id}-seal-left`}><g clipPath={`url(#${id}-left)`}><use href={`#${id}-disc`} /></g></g>
      <g id={`${id}-seal-right`}><g clipPath={`url(#${id}-right)`}><use href={`#${id}-disc`} /></g></g>
    </svg>
  );
}
