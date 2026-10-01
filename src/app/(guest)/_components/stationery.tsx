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
          <stop stopColor="#fff0bd" /><stop offset=".18" stopColor="#debf7b" />
          <stop offset=".37" stopColor="#b38a44" /><stop offset=".51" stopColor="#f0d89d" />
          <stop offset=".7" stopColor="#a07b3d" /><stop offset="1" stopColor="#c8a366" />
        </linearGradient>
        <radialGradient id={`${id}-wax`} cx=".32" cy=".23" r=".85">
          <stop stopColor="#e9d4a0" /><stop offset=".36" stopColor="#cfb075" />
          <stop offset=".76" stopColor="#b68f50" /><stop offset="1" stopColor="#96703a" />
        </radialGradient>
        <linearGradient id={`${id}-well`} x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="#806031" /><stop offset=".42" stopColor="#c2a06a" />
          <stop offset="1" stopColor="#f1db9e" />
        </linearGradient>
        <radialGradient id={`${id}-shine`} cx=".28" cy=".15" r=".8">
          <stop stopColor="#fff2c1" stopOpacity=".65" /><stop offset=".55" stopColor="#fff2c1" stopOpacity="0" />
          <stop offset="1" stopColor="#6f4a24" stopOpacity=".16" />
        </radialGradient>
        <clipPath id={`${id}-left`}><path d="M0 0H60L58 19 62 30 58 41 61 51 57 63 62 76 58 88 61 101 60 120H0Z" /></clipPath>
        <clipPath id={`${id}-right`}><path d="M60 0H120V120H60L61 101 58 88 62 76 57 63 61 51 58 41 62 30 58 19Z" /></clipPath>
        <g id={`${id}-disc`}>
          <path d="M60 8C72 5 78 13 88 16S102 27 106 39 109 57 108 68 102 88 92 98 73 109 60 110 39 105 27 100 13 82 10 70 7 48 13 35 22 20 34 13 47 10 60 8Z" transform="translate(0 1.6)" fill="#95713c" stroke="#8e6833" strokeWidth=".8" />
          <path d="M60 8C72 5 78 13 88 16S102 27 106 39 109 57 108 68 102 88 92 98 73 109 60 110 39 105 27 100 13 82 10 70 7 48 13 35 22 20 34 13 47 10 60 8Z" fill={`url(#${id}-rim)`} stroke="#a5824b" strokeWidth=".7" />
          <circle cx="60" cy="60" r="44" fill="none" stroke="#a17c41" strokeWidth="3.5" opacity=".62" />
          <circle cx="59.6" cy="58.7" r="43" fill="none" stroke={`url(#${id}-rim)`} strokeWidth="4.8" />
          <circle cx="60" cy="60.5" r="39.5" fill="none" stroke={`url(#${id}-well)`} strokeWidth="3.2" />
          <circle cx="60" cy="61" r="39.5" fill={`url(#${id}-wax)`} stroke={`url(#${id}-well)`} strokeWidth="1.3" />
          <circle cx="60" cy="59.8" r="37.5" fill={`url(#${id}-shine)`} stroke="#d9bd80" strokeWidth=".45" />
          <path d="M24 49C29 28 43 21 63 22M37 96Q58 106 82 93" fill="none" stroke="#fff0bd" strokeWidth=".8" opacity=".7" />
          <path d="M89 32Q107 57 90 85" fill="none" stroke="#86602d" strokeWidth="1" opacity=".35" />
          <text x="60.25" y="72.75" textAnchor="middle" className="wax-initials wax-impression-light" data-script={scriptOf(brideName + groomName)}>{initial(brideName)}{initial(groomName)}</text>
          <text x="60" y="72" textAnchor="middle" className="wax-initials" data-script={scriptOf(brideName + groomName)}>{initial(brideName)}{initial(groomName)}</text>
          <path d="M25 39A40 40 0 0 1 65 19" fill="none" stroke="#fff0c6" strokeWidth="1.5" strokeLinecap="round" opacity=".85" />
        </g>
      </defs>
      <g id={`${id}-seal-left`}><g clipPath={`url(#${id}-left)`}><use href={`#${id}-disc`} /></g></g>
      <g id={`${id}-seal-right`}><g clipPath={`url(#${id}-right)`}><use href={`#${id}-disc`} /></g></g>
    </svg>
  );
}
