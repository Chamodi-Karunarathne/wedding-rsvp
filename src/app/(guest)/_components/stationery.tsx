import { useId } from 'react';
import { readCardSvg } from '@/lib/svg';

/** The commissioned mark is shared by the opening, seal and thank-you. */
export function Monogram() {
  const id = useId();
  const art = readCardSvg('monogram');
  return <div className="stationery-monogram" aria-hidden="true"><svg data-svg="monogram" viewBox={art.viewBox} focusable="false" dangerouslySetInnerHTML={{ __html: art.inner.replaceAll('id="monogram__', 'id="' + id + '-monogram__') }} /></div>;
}

/** Two independently transformable wax halves, with static bevel lighting. */
export function WaxSeal() {
  const id = useId().replace(/:/g, '');
  const monogram = readCardSvg('monogram');
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
          <svg className="wax-monogram" x="29" y="39" width="62" height="41.36" viewBox={monogram.viewBox} dangerouslySetInnerHTML={{ __html: monogram.inner.replaceAll('id="monogram__', `id="${id}-monogram__`) }} />
          <path d="M25 39A40 40 0 0 1 65 19" fill="none" stroke="#fff0c6" strokeWidth="1.5" strokeLinecap="round" opacity=".85" />
        </g>
      </defs>
      <g id={`${id}-seal-left`}><g clipPath={`url(#${id}-left)`}><use href={`#${id}-disc`} /></g></g>
      <g id={`${id}-seal-right`}><g clipPath={`url(#${id}-right)`}><use href={`#${id}-disc`} /></g></g>
    </svg>
  );
}
