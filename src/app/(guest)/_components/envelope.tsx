import type { CSSProperties } from 'react';
import { envelopeNameScale } from '@/lib/domain/names';
import { scriptOf } from '@/lib/domain/script';
import { InlineSvg } from '@/lib/svg';

/*
 * The envelope, with the guest's name written on its face.
 *
 * The name is here and NOT on the card. The card is a faithful reproduction
 * of the printed piece, which carries no name; a handwritten name belongs on
 * the envelope, which is exactly where the printed one has it.
 *
 * The name is live text over the artwork rather than baked into the SVG -
 * five hundred households would otherwise be five hundred exports.
 */

type Props = {
  /** The card name: the shorter fallback when one is set, else display_name. */
  name: string;
};

export function Envelope({ name }: Props) {
  const script = scriptOf(name);
  const scale = envelopeNameScale(name);

  return (
    <div className="envelope-stage">
      <InlineSvg name="envelope" className="envelope-art" />

      {/*
        data-script picks the font stack. Linux Libertine has no Sinhala
        coverage at all, so a Sinhala name set in it renders as tofu - and the
        guests most likely to be addressed in Sinhala are the least likely to
        report that as a bug rather than assume their phone is broken.
      */}
      <p
        className="envelope-name"
        data-script={script}
        data-intro="name"
        style={{ '--name-scale': scale } as CSSProperties}
      >
        {name}
      </p>
    </div>
  );
}
