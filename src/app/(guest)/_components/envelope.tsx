import type { CSSProperties } from 'react';
import { envelopeNameScale } from '@/lib/domain/names';
import { scriptOf } from '@/lib/domain/script';
import { WaxSeal } from './stationery';

/*
 * The envelope, built from layers rather than from envelope.svg.
 *
 * The export is one flat drawing: a rectangle with a triangle on it. Nothing
 * can come OUT of that, because there is no front panel for a card to emerge
 * from behind - which is the whole of beat 4. So the envelope is assembled
 * here instead, in the order a real one stacks:
 *
 *   back   the panel behind everything
 *   sleeve the card, sitting inside
 *   body   the front panel, which the card slides up from behind
 *   flap   folded down over the front, and lifted by beat 3
 *
 * Each layer is a div with a clip-path, not an <img>: they have to be
 * separately transformable, and the flap has to rotate about its own top edge
 * while the card translates independently behind it.
 *
 * The name is live text over the artwork rather than baked in - five hundred
 * households would otherwise be five hundred exports.
 */

type Props = {
  /** The card name: the shorter fallback when one is set, else display_name. */
  name: string;
  /**
   * The wax seal at the point of the flap, and the card inside.
   *
   * Only the copy inside the intro needs either: beat 3 breaks the seal and
   * beat 4 draws the card out. The resting envelope on the page is left
   * closed and empty rather than showing a seal nothing will ever break.
   */
  sealed?: boolean;
  brideName: string;
  groomName: string;
};

export function Envelope({ name, sealed = false, brideName, groomName }: Props) {
  const script = scriptOf(name);
  const scale = envelopeNameScale(name);

  return (
    <div className="env" data-sealed={sealed ? 'true' : 'false'}>
      <div className="env-back" />

      {/*
        The card inside. A plain panel, not the real artwork: it is in motion
        and mostly hidden, and rendering five hundred vector paths twice in
        every response to animate something nobody can read at this size is
        not a trade worth making. Beat 4 hands over to the real card as this
        one reaches the middle.
      */}
      {sealed && (
        <div className="env-pocket" aria-hidden="true"><div className="env-sleeve" data-intro="sleeve">
          <div className="env-sleeve-rule" />
          <div className="env-sleeve-shade" />
        </div></div>
      )}

      <div className="env-body"><div className="env-fold env-fold-left" /><div className="env-fold env-fold-right" /><div className="env-fold env-fold-bottom" /></div>
      <div className="env-flap" data-intro="flap" />

      {/*
        data-script picks the font stack. Linux Libertine has no Sinhala
        coverage at all, so a Sinhala name set in it renders as tofu - and the
        guests most likely to be addressed in Sinhala are the least likely to
        report that as a bug rather than assume their phone is broken.
      */}
      <p
        className="env-name"
        data-script={script}
        style={{ '--name-scale': scale } as CSSProperties}
      >
        {name}
      </p>

      {sealed && (
        <div className="env-seal" data-intro="seal">
          <WaxSeal brideName={brideName} groomName={groomName} />
        </div>
      )}
    </div>
  );
}
