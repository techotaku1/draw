import type { Point } from '@/features/landmarks/types';
import { VIEWBOX_WIDTH, viewBoxHeight } from '@/features/landmarks/viewbox';
import { GROUP_COLOR } from './joints';
import type { Layer } from './steps';
import type { Mass, Skeleton } from './types';

const ACTION_LINE_COLOR = '#dc2626';
const MASS_COLOR = '#6366f1';
const AXIS_COLOR = '#0891b2';

/**
 * Guide weight as a fraction of one head unit. Construction lines are drawn
 * thin in the references this follows: they sit under the drawing rather than
 * compete with it.
 */
const HAIRLINE = 0.016;

const toPath = (points: Point[]): string =>
  points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');

const MassShape = (props: { mass: Mass; stroke: number }) => {
  const dash = `${props.stroke * 3} ${props.stroke * 2}`;

  if (props.mass.kind === 'head') {
    return (
      <g>
        <circle
          cx={props.mass.cranium.center.x}
          cy={props.mass.cranium.center.y}
          r={props.mass.cranium.radius}
          fill={MASS_COLOR}
          fillOpacity={0.08}
          stroke={MASS_COLOR}
          strokeWidth={props.stroke}
          strokeDasharray={dash}
        />
        <path
          d={toPath(props.mass.jaw)}
          fill="none"
          stroke={MASS_COLOR}
          strokeWidth={props.stroke}
          strokeDasharray={dash}
          strokeLinejoin="round"
        />
      </g>
    );
  }

  if (props.mass.kind === 'quad') {
    return (
      <polygon
        points={props.mass.points.map((point) => `${point.x},${point.y}`).join(' ')}
        fill={MASS_COLOR}
        fillOpacity={0.08}
        stroke={MASS_COLOR}
        strokeWidth={props.stroke}
        strokeDasharray={dash}
      />
    );
  }

  return (
    <ellipse
      cx={props.mass.center.x}
      cy={props.mass.center.y}
      rx={props.mass.rx}
      ry={props.mass.ry}
      transform={`rotate(${props.mass.rotation} ${props.mass.center.x} ${props.mass.center.y})`}
      fill={MASS_COLOR}
      fillOpacity={0.08}
      stroke={MASS_COLOR}
      strokeWidth={props.stroke}
      strokeDasharray={dash}
    />
  );
};

// Pure SVG rendering of the structural sketch. It holds no state so the same
// markup can be shown over the photo and serialized for the PNG export.
export const SkeletonOverlay = (props: {
  skeleton: Skeleton;
  layers: Layer[];
  /** Reference image aspect ratio (`width / height`). */
  aspect: number;
  className?: string;
}) => {
  const height = viewBoxHeight(props.aspect);
  // Scale off the head once it exists, so the construction keeps the same
  // weight relative to the figure whatever the upload. Before that, fall back
  // to the view box WIDTH, which is fixed: the height swings with the aspect
  // ratio, which made a tall shot start out far heavier than a wide one.
  const unit = props.skeleton.metrics.headUnit ?? VIEWBOX_WIDTH / 7.5;
  const stroke = unit * HAIRLINE;
  const visible = new Set(props.layers);

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${height}`}
      className={props.className}
      preserveAspectRatio="xMidYMid meet"
      role="presentation"
    >
      {visible.has('masses') && (
        <g>
          {props.skeleton.masses.map((mass) => (
            <MassShape key={mass.id} mass={mass} stroke={stroke * 0.9} />
          ))}
        </g>
      )}

      {visible.has('axes') && (
        <g strokeLinecap="round">
          {(['shoulders', 'hips'] as const).map((name) => {
            const axis = props.skeleton.axes[name];

            if (!axis) {
              return null;
            }

            return (
              <line
                key={name}
                x1={axis.from.x}
                y1={axis.from.y}
                x2={axis.to.x}
                y2={axis.to.y}
                stroke={AXIS_COLOR}
                strokeWidth={stroke * 1.1}
                strokeDasharray={`${stroke * 4} ${stroke * 2.5}`}
              />
            );
          })}
        </g>
      )}

      {visible.has('bones') && (
        <g strokeLinecap="round">
          {props.skeleton.bones.map((bone) => (
            <line
              key={bone.id}
              x1={bone.from.x}
              y1={bone.from.y}
              x2={bone.to.x}
              y2={bone.to.y}
              stroke={GROUP_COLOR[bone.group]}
              strokeWidth={stroke * bone.weight}
              strokeOpacity={0.9}
            />
          ))}
        </g>
      )}

      {visible.has('actionLine') && props.skeleton.actionLine.length > 1 && (
        <path
          d={toPath(props.skeleton.actionLine)}
          fill="none"
          stroke={ACTION_LINE_COLOR}
          strokeWidth={stroke * 1.7}
          strokeLinecap="round"
          strokeOpacity={0.85}
        />
      )}

      {visible.has('joints') && (
        <g>
          {props.skeleton.joints.map((joint) => (
            <circle
              key={joint.id}
              cx={joint.at.x}
              cy={joint.at.y}
              r={joint.radius}
              fill="#ffffff"
              fillOpacity={0.55}
              stroke={GROUP_COLOR[joint.group]}
              strokeWidth={stroke * 0.9}
            />
          ))}
        </g>
      )}
    </svg>
  );
};
