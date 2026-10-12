import type { Point } from '@/features/landmarks/types';
import { VIEWBOX_WIDTH, viewBoxHeight } from '@/features/landmarks/viewbox';
import { FACE_COLOR } from './landmarks';
import type { FaceLayer } from './steps';
import type { FaceGuides, GuideLine } from './types';

const AXIS_COLOR = '#7c3aed';
const FIFTH_COLOR = '#0891b2';

/**
 * Guide weight as a fraction of the cranium radius. Construction lines are
 * drawn with the side of a pencil in the references this follows: thin enough
 * to sit under the drawing rather than compete with it.
 */
const HAIRLINE = 0.009;

const toPath = (points: Point[]): string =>
  points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');

const BOX_COLOR = '#64748b';

const LINE_LAYER: Record<GuideLine['kind'], FaceLayer> = {
  hairLine: 'hairLine',
  browLine: 'browLine',
  eyeLine: 'eyeLine',
  fifth: 'fifth',
  noseLine: 'noseLine',
  mouthLine: 'mouthLine',
  chinLine: 'chinLine',
};

// The divisions are coloured by what they belong to, not by where they sit:
// the hairline bounds the skull, brow and eyes are the eye band, and nose,
// mouth and chin are the features that hang below it.
const LINE_COLOR: Record<GuideLine['kind'], string> = {
  hairLine: FACE_COLOR.cranium,
  browLine: FACE_COLOR.eyes,
  eyeLine: FACE_COLOR.eyes,
  fifth: FIFTH_COLOR,
  noseLine: FACE_COLOR.features,
  mouthLine: FACE_COLOR.features,
  chinLine: FACE_COLOR.jaw,
};

// Pure SVG rendering of the face construction. Stateless, so the same markup
// serves the on-screen guide and the PNG export.
export const FaceOverlay = (props: {
  guides: FaceGuides;
  layers: FaceLayer[];
  /** Reference image aspect ratio (`width / height`). */
  aspect: number;
  className?: string;
}) => {
  const height = viewBoxHeight(props.aspect);
  // Scale off the skull once it exists, so the construction keeps the same
  // weight relative to the head whatever the upload. Before that, fall back to
  // the view box WIDTH, which is fixed: the height swings with the aspect
  // ratio, which made a portrait start out three times heavier than a
  // landscape shot of the same face.
  const unit = props.guides.cranium?.radius ?? VIEWBOX_WIDTH / 8;
  const stroke = unit * HAIRLINE;
  const visible = new Set(props.layers);

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${height}`}
      className={props.className}
      preserveAspectRatio="xMidYMid meet"
      role="presentation"
    >
      {visible.has('headBox') && props.guides.headBox.length > 1 && (
        <path
          d={toPath(props.guides.headBox)}
          fill="none"
          stroke={BOX_COLOR}
          strokeWidth={stroke * 0.9}
          strokeOpacity={0.7}
        />
      )}

      {visible.has('cranium') && props.guides.cranium && (
        <circle
          cx={props.guides.cranium.center.x}
          cy={props.guides.cranium.center.y}
          r={props.guides.cranium.radius}
          fill={FACE_COLOR.cranium}
          fillOpacity={0.05}
          stroke={FACE_COLOR.cranium}
          strokeWidth={stroke * 1.25}
        />
      )}

      {visible.has('jaw') && props.guides.jaw.length > 1 && (
        <path
          d={toPath(props.guides.jaw)}
          fill="none"
          stroke={FACE_COLOR.jaw}
          strokeWidth={stroke * 1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {visible.has('axis') && props.guides.axis.length > 1 && (
        <path
          d={toPath(props.guides.axis)}
          fill="none"
          stroke={AXIS_COLOR}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${stroke * 4} ${stroke * 3}`}
        />
      )}

      <g strokeLinecap="round">
        {props.guides.lines.map((line) =>
          visible.has(LINE_LAYER[line.kind]) && line.points.length > 1 ? (
            <path
              key={line.id}
              d={toPath(line.points)}
              fill="none"
              stroke={LINE_COLOR[line.kind]}
              strokeWidth={line.kind === 'fifth' ? stroke * 0.8 : stroke}
              strokeDasharray={line.kind === 'fifth' ? `${stroke * 4} ${stroke * 3}` : undefined}
              strokeOpacity={line.kind === 'fifth' ? 0.75 : 0.95}
            />
          ) : null,
        )}
      </g>

      {visible.has('noseArc') && props.guides.noseArc.length > 1 && (
        <path
          d={toPath(props.guides.noseArc)}
          fill="none"
          stroke={FACE_COLOR.features}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeOpacity={0.9}
        />
      )}
    </svg>
  );
};
