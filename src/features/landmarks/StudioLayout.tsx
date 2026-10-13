'use client';

import { useState } from 'react';

export type StudioTab = {
  id: string;
  label: string;
  /** Shown beside the label when the tab tracks a count or a step. */
  badge?: string;
  content: React.ReactNode;
};

// The whole tool in one viewport: command bar, canvas, one tabbed panel and a
// status strip. Nothing here scrolls the page — the panel is the only surface
// allowed to overflow, and only inside itself.
export const StudioLayout = (props: {
  brand: string;
  commandBar: React.ReactNode;
  canvas: React.ReactNode;
  statusBar: React.ReactNode;
  notice: React.ReactNode;
  tabs: StudioTab[];
}) => {
  const [activeId, setActiveId] = useState(props.tabs[0]?.id ?? '');
  const active = props.tabs.find((tab) => tab.id === activeId) ?? props.tabs[0];

  return (
    // The no-scroll rule is a desktop affordance. On a phone there is not
    // enough height for canvas and panel at once, so the page scrolls normally.
    <div className="flex min-h-dvh flex-col bg-graphite-950 text-chalk lg:h-dvh lg:overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-graphite-700 px-4 py-2.5">
        <span className="text-[15px] font-semibold tracking-tight">{props.brand}</span>
        {props.commandBar}
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center p-4">{props.canvas}</div>

          {/* One row on a desktop, whatever it costs the readout. The strip
              carries a state line, the view controls and a reset; letting it
              wrap sent the reset button to a second row on its own, which read
              as a broken layout rather than as a strip. Only the state line
              may shrink, so the controls keep their size and the text
              truncates instead. Below `lg` the page scrolls anyway, so there
              it is allowed to wrap. */}
          <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-t border-graphite-700 px-4 py-2.5 text-[13px] lg:flex-nowrap">
            {props.statusBar}
          </div>
        </main>

        <aside className="flex min-h-0 w-full shrink-0 flex-col border-t border-graphite-700 lg:w-[340px] lg:border-t-0 lg:border-l">
          <div className="flex shrink-0 border-b border-graphite-700" role="tablist">
            {props.tabs.map((tab) => {
              const isActive = tab.id === active?.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`flex flex-1 items-baseline justify-center gap-1.5 px-2 py-2.5 text-[13px] transition-colors ${
                    isActive
                      ? 'bg-graphite-800 text-chalk'
                      : 'text-chalk-faint hover:bg-graphite-900 hover:text-chalk-dim'
                  }`}
                  onClick={() => {
                    setActiveId(tab.id);
                  }}
                >
                  {tab.label}
                  {tab.badge ? (
                    <span className="text-[11px] text-chalk-faint tabular-nums">{tab.badge}</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {props.notice}
            {active?.content}
          </div>
        </aside>
      </div>
    </div>
  );
};
