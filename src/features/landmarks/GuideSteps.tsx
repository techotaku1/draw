'use client';

import { BUTTON, PANEL_TITLE } from './controls';

// The step-by-step teaching panel. It takes already-translated strings so the
// body and the face studio can share it without sharing a message namespace.
export const GuideSteps = (props: {
  counter: string;
  previousLabel: string;
  nextLabel: string;
  stepTitle: string;
  stepBody: string;
  /** One accessible label per step, in order. */
  stepLabels: readonly string[];
  stepIndex: number;
  onStepChange: (index: number) => void;
}) => (
  <div className="flex flex-col gap-3">
    <ol className="flex gap-1">
      {props.stepLabels.map((label, index) => (
        <li key={label} className="flex-1">
          <button
            type="button"
            aria-current={index === props.stepIndex ? 'step' : undefined}
            aria-label={label}
            className={`h-1 w-full rounded-full transition-colors ${
              index <= props.stepIndex ? 'bg-chalk' : 'bg-graphite-700'
            }`}
            onClick={() => {
              props.onStepChange(index);
            }}
          />
        </li>
      ))}
    </ol>

    <p className="text-[12px] text-chalk-faint tabular-nums">{props.counter}</p>

    <h3 className={PANEL_TITLE}>{props.stepTitle}</h3>
    <p className="text-[13px] leading-relaxed text-chalk-dim">{props.stepBody}</p>

    <div className="flex gap-2">
      <button
        type="button"
        disabled={props.stepIndex === 0}
        className={BUTTON}
        onClick={() => {
          props.onStepChange(props.stepIndex - 1);
        }}
      >
        {props.previousLabel}
      </button>
      <button
        type="button"
        disabled={props.stepIndex === props.stepLabels.length - 1}
        className={BUTTON}
        onClick={() => {
          props.onStepChange(props.stepIndex + 1);
        }}
      >
        {props.nextLabel}
      </button>
    </div>
  </div>
);
