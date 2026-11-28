import { useState, useEffect, useRef, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCorners,
  pointerWithin,
  rectIntersection,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Clock,
  FileText,
  ChevronRight,
  Inbox,
  Trash2,
  Lock,
  Loader2,
  Briefcase,
  UserPlus,
  Copy,
  Check,
  ChevronLeft,
  ChevronDown,
} from 'lucide-react';
import Modal from '../Modal';

// Column accent theme derived dynamically from stage metadata / order (never hardcoded column names)
function getStageAccent(stage, index) {
  const code = (stage.code || stage.name || '').toLowerCase();
  if (stage.terminal_type === 'hired' || code.includes('hire')) {
    return {
      bar: 'bg-emerald-500',
      badge: 'bg-emerald-100 text-emerald-700',
      ring: 'ring-emerald-400',
      bgOver: 'bg-emerald-50/70',
    };
  }
  if (code.includes('offer')) {
    return {
      bar: 'bg-purple-600',
      badge: 'bg-purple-100 text-purple-700',
      ring: 'ring-purple-400',
      bgOver: 'bg-purple-50/70',
    };
  }
  if (code.includes('interview')) {
    return {
      bar: 'bg-amber-400',
      badge: 'bg-amber-100 text-amber-800',
      ring: 'ring-amber-400',
      bgOver: 'bg-amber-50/70',
    };
  }
  if (code.includes('screen')) {
    return {
      bar: 'bg-indigo-500',
      badge: 'bg-indigo-100 text-indigo-700',
      ring: 'ring-indigo-400',
      bgOver: 'bg-indigo-50/70',
    };
  }
  if (stage.is_initial || code.includes('applied')) {
    return {
      bar: 'bg-blue-500',
      badge: 'bg-blue-100 text-blue-700',
      ring: 'ring-blue-400',
      bgOver: 'bg-blue-50/70',
    };
  }
  const palette = [
    { bar: 'bg-sky-500', badge: 'bg-sky-100 text-sky-700', ring: 'ring-sky-400', bgOver: 'bg-sky-50/70' },
    { bar: 'bg-teal-500', badge: 'bg-teal-100 text-teal-700', ring: 'ring-teal-400', bgOver: 'bg-teal-50/70' },
    { bar: 'bg-cyan-500', badge: 'bg-cyan-100 text-cyan-700', ring: 'ring-cyan-400', bgOver: 'bg-cyan-50/70' },
  ];
  return palette[index % palette.length];
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-indigo-500',
  'bg-purple-500',
  'bg-sky-500',
  'bg-teal-500',
  'bg-violet-500',
];

function getAvatarColor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function KanbanCardContent({
  app,
  showJobBadge,
  recruiters = [],
  onQuickAssign,
  onOpenDetail,
  onOpenResume,
  isOverlay = false,
}) {
  const [assignMenuOpen, setAssignMenuOpen] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const handleCopyEmail = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(app.candidate_email);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  const initial = (app.candidate_name || 'C').trim()[0]?.toUpperCase() || 'C';
  const avatarBg = getAvatarColor(app.candidate_name || app.candidate_email || '');

  return (
    <div
      className={`bg-white rounded-xl border border-gray-200/90 p-2.5 transition-all select-none relative ${
        isOverlay
          ? 'shadow-2xl ring-2 ring-blue-500/40 rotate-[1.5deg] cursor-grabbing w-[225px]'
          : 'shadow-xs hover:shadow-md hover:border-blue-300/80 cursor-grab active:cursor-grabbing'
      }`}
    >
      {/* Top Row: Candidate Avatar + Name/Email + Assignee Avatar (click to quick-assign) */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-8 h-8 rounded-full ${avatarBg} text-white font-bold text-[0.8125rem] flex items-center justify-center shrink-0 shadow-xs`}
          >
            {initial}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-900 truncate leading-tight" title={app.candidate_name}>
              {app.candidate_name}
            </div>
          </div>
        </div>

        {/* Assignee Avatar / Quick-Assign Trigger */}
        {!isOverlay && (
          <div className="relative shrink-0" onPointerDown={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setAssignMenuOpen((v) => !v);
              }}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all overflow-hidden ${
                app.assignee
                  ? 'bg-indigo-100 border border-indigo-200 text-indigo-800 hover:ring-2 hover:ring-blue-400'
                  : 'bg-gray-50 border border-dashed border-gray-300 text-slate-700 hover:border-blue-400 hover:text-blue-600'
              }`}
              title={
                app.assignee
                  ? `Assigned to ${app.assignee.full_name} (click to reassign)`
                  : 'Unassigned (click to assign)'
              }
            >
              {app.assignee ? (
                app.assignee.photo_url ? (
                  <img
                    src={app.assignee.photo_url}
                    alt={app.assignee.full_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  (app.assignee.full_name || 'R')
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                )
              ) : (
                <UserPlus size={13} />
              )}
            </button>

            {assignMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAssignMenuOpen(false);
                  }}
                />
                <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl border border-gray-200 shadow-xl z-30 py-1 text-xs max-h-56 overflow-y-auto">
                  <div className="px-2.5 py-1 text-[0.8125rem] font-bold uppercase tracking-wider text-slate-700 border-b border-gray-100">
                    Assign Recruiter
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssignMenuOpen(false);
                      onQuickAssign?.(app, null);
                    }}
                    className={`w-full px-2.5 py-1.5 text-left hover:bg-gray-50 flex items-center justify-between ${
                      !app.assigned_to ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700'
                    }`}
                  >
                    <span>Unassigned Pool</span>
                  </button>
                  {recruiters.map((rec) => (
                    <button
                      key={rec.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAssignMenuOpen(false);
                        onQuickAssign?.(app, rec.id);
                      }}
                      className={`w-full px-2.5 py-1.5 text-left hover:bg-gray-50 flex items-center justify-between gap-2 ${
                        app.assigned_to === rec.id
                          ? 'bg-blue-50 text-blue-700 font-semibold'
                          : 'text-gray-700'
                      }`}
                    >
                      <span className="truncate">{rec.full_name}</span>
                      {typeof rec.pending_count === 'number' && (
                        <span className="text-[0.8125rem] text-slate-700 shrink-0 font-medium">
                          {rec.pending_count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Email: full-width row so it gets the whole card width; tooltip + copy */}
      {app.candidate_email && (
        <div
          className="mt-1.5 flex items-center gap-1 min-w-0"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span
            className="flex-1 min-w-0 text-[0.8125rem] text-slate-700 truncate font-medium"
            title={app.candidate_email}
          >
            {app.candidate_email}
          </span>
          {!isOverlay && (
            <button
              type="button"
              onClick={handleCopyEmail}
              className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title={emailCopied ? 'Copied!' : 'Copy email'}
            >
              {emailCopied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
            </button>
          )}
        </div>
      )}

      {/* Job Title, Department & Other Applications Badge */}
      <div className="mt-2 space-y-0.5">
        <div className="flex items-center justify-between gap-1">
          {showJobBadge ? (
            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[0.8125rem] font-semibold max-w-full min-w-0">
              <Briefcase size={13} className="shrink-0 text-slate-600" />
              <span className="truncate">{app.job_title}</span>
            </div>
          ) : (
            <div className="text-[0.8125rem] font-bold text-gray-800 truncate">{app.job_title}</div>
          )}

          {app.other_applications_count > 0 && (
            <span
              className="shrink-0 inline-flex items-center px-1.5 py-0.2 rounded-full text-[0.8125rem] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
              title={`This candidate has ${app.other_applications_count} other application(s)`}
            >
              +{app.other_applications_count}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1.5">
          <div className="text-[0.8125rem] text-slate-700 truncate font-medium">
            {app.department_name || 'General'}
          </div>
          <span
            className="inline-flex items-center gap-0.5 text-[0.8125rem] font-medium text-slate-700 shrink-0"
            title={app.days_in_stage === 0 ? 'Entered stage today' : `${app.days_in_stage} days in stage`}
          >
            <Clock size={13} className="text-slate-700" />
            <span>{app.days_in_stage === 0 ? 'Today' : `${app.days_in_stage}d`}</span>
          </span>
        </div>
      </div>

      {/* Footer: PDF + Review */}
      <div
        className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between gap-1.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {app.has_resume ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenResume?.(app);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[0.8125rem] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors shrink-0"
            title="View Resume PDF"
          >
            <FileText size={13} />
            <span>PDF</span>
          </button>
        ) : (
          <span className="text-[0.8125rem] text-gray-300 italic">No PDF</span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail?.(app.id);
          }}
          className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-[0.8125rem] font-semibold bg-white text-blue-600 border border-blue-200 hover:bg-blue-50 transition-colors shrink-0"
        >
          <span>Review</span>
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

function DraggableKanbanCard({ app, showJobBadge, recruiters, onQuickAssign, onOpenDetail, onOpenResume }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: app.id,
    data: { app },
  });

  const style = transform
    ? {
        transform: CSS.Translate.toString(transform),
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={isDragging ? 'opacity-30' : 'opacity-100'}
    >
      <KanbanCardContent
        app={app}
        showJobBadge={showJobBadge}
        recruiters={recruiters}
        onQuickAssign={onQuickAssign}
        onOpenDetail={onOpenDetail}
        onOpenResume={onOpenResume}
      />
    </div>
  );
}

function KanbanColumn({
  stage,
  index,
  items,
  count,
  hasMore,
  loadingMore,
  showJobBadge,
  recruiters,
  isBlockedTarget,
  onQuickAssign,
  onLoadMore,
  onOpenDetail,
  onOpenResume,
  wide = false,
}) {
  const accent = getStageAccent(stage, index);
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
    data: { stage },
    disabled: isBlockedTarget,
  });

  const sentinelRef = useRef(null);

  useEffect(() => {
    if (!hasMore || loadingMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore?.(stage.id);
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, stage.id, onLoadMore]);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-2xl bg-slate-50/90 border transition-all min-w-0 w-full max-h-[calc(100vh-280px)] min-h-[420px] overflow-hidden ${
        isBlockedTarget
          ? 'border-gray-200 opacity-60'
          : isOver
          ? `border-transparent ring-2 ${accent.ring} ${accent.bgOver}`
          : 'border-gray-200/80'
      }`}
    >
      {/* Top Accent Bar */}
      <div className={`h-1.5 w-full ${accent.bar} shrink-0`} />

      {/* Column Header */}
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-gray-200/60 bg-white/70 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <h3 className="text-sm font-bold text-gray-900 truncate">{stage.name}</h3>
          {isBlockedTarget && (
            <Lock size={12} className="text-slate-700 shrink-0" title="Org Admin only" />
          )}
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[0.8125rem] font-bold shrink-0 ${accent.badge}`}
        >
          {count}
        </span>
      </div>

      {/* Scrollable Card Stack */}
      <div
        className={`flex-1 overflow-y-auto p-2 scrollbar-thin ${
          wide ? 'grid gap-2.5 content-start justify-start' : 'space-y-2'
        }`}
        style={wide ? { gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 300px))' } : undefined}
      >
        {items.length === 0 ? (
          <div className="col-span-full h-44 rounded-xl border-2 border-dashed border-gray-200/90 bg-white/50 flex flex-col items-center justify-center text-slate-700 px-4 text-center">
            <Inbox size={26} className="mb-2 text-gray-300" />
            <span className="text-xs font-medium text-slate-700">
              {isBlockedTarget ? 'Org Admin only' : 'Drag candidate card here'}
            </span>
          </div>
        ) : (
          <>
            {items.map((app) => (
              <DraggableKanbanCard
                key={app.id}
                app={app}
                showJobBadge={showJobBadge}
                recruiters={recruiters}
                onQuickAssign={onQuickAssign}
                onOpenDetail={onOpenDetail}
                onOpenResume={onOpenResume}
              />
            ))}

            {hasMore && (
              <div ref={sentinelRef} className="py-2 text-center col-span-full">
                {loadingMore ? (
                  <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-slate-700 font-medium">
                    <Loader2 size={13} className="animate-spin" /> Loading more...
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onLoadMore?.(stage.id)}
                    className="text-[0.8125rem] font-semibold text-blue-600 hover:text-blue-700"
                  >
                    Load more ({count - items.length} remaining)
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RejectDropZone({ isDragging, isBlocked }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'reject-drop-zone',
    data: { isRejectZone: true },
    disabled: isBlocked,
  });

  return (
    <div
      ref={setNodeRef}
      className={`mt-4 rounded-xl border-2 border-dashed px-4 py-3.5 flex items-center justify-center gap-2 text-sm font-semibold transition-all ${
        isBlocked
          ? 'border-gray-300 bg-gray-100/80 text-gray-400 cursor-not-allowed'
          : isOver
          ? 'border-red-500 bg-red-100 text-red-700 scale-[1.01] shadow-md'
          : isDragging
          ? 'border-red-400 bg-red-50 text-red-600 shadow-xs'
          : 'border-red-300/90 bg-red-50/50 text-red-600'
      }`}
    >
      {isBlocked ? <Lock size={16} /> : <Trash2 size={17} />}
      <span>
        {isBlocked
          ? 'Only Org Admin can reject candidates from Interview stage onward'
          : 'Drop here to Reject Candidate'}
      </span>
    </div>
  );
}

// Pointer-first collision detection so wide/short Reject zone at bottom
// is never stolen by the corners of narrow columns directly above it.
function kanbanCollisionDetection(args) {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) {
    const rejectHit = pointerHits.find((c) => c.id === 'reject-drop-zone');
    if (rejectHit) return [rejectHit];
    return pointerHits;
  }

  const rectHits = rectIntersection(args);
  if (rectHits.length > 0) {
    const rejectHit = rectHits.find((c) => c.id === 'reject-drop-zone');
    if (rejectHit) return [rejectHit];
    return rectHits;
  }

  return closestCorners(args);
}

export default function KanbanBoard({
  stages,
  rejectedStage,
  columns,
  loading,
  loadingMoreMap,
  showJobBadge,
  recruiters = [],
  canMoveToStage,
  canRejectCard,
  onQuickAssign,
  onDropToStage,
  onDropToReject,
  onLoadMoreColumn,
  onOpenDetail,
  onOpenResume,
}) {
  const [activeCard, setActiveCard] = useState(null);
  const [phoneStage, setPhoneStage] = useState('ALL');
  const [stagePickerOpen, setStagePickerOpen] = useState(false);
  const swipeStart = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor)
  );

  // Flattened list for Mobile view
  const allLoadedCards = useMemo(() => {
    const list = [];
    for (const st of stages) {
      const col = columns[st.id];
      if (col?.items) {
        list.push(...col.items);
      }
    }
    return list;
  }, [stages, columns]);

  // Phones: one stage at a time (tabs), 'ALL' keeps the flat list
  const phoneStageValid = phoneStage === 'ALL' || stages.some((st) => st.id === phoneStage);
  const phoneActive = phoneStageValid ? phoneStage : 'ALL';
  const phoneCards = phoneActive === 'ALL' ? allLoadedCards : allLoadedCards.filter((a) => a.stage_id === phoneActive);
  const phoneTotal = stages.reduce((sum, st) => sum + (st.applicants_count ?? columns[st.id]?.total ?? 0), 0);
  const phoneTabs = [
    { id: 'ALL', name: 'All stages', count: phoneTotal },
    ...stages.map((st) => ({ id: st.id, name: st.name, count: st.applicants_count ?? columns[st.id]?.total ?? 0 })),
  ];
  const phoneIndex = Math.max(0, phoneTabs.findIndex((t) => t.id === phoneActive));
  const stepStage = (dir) => {
    const next = phoneTabs[phoneIndex + dir];
    if (next) setPhoneStage(next.id);
  };
  const onSwipeStart = (e) => {
    const t = e.touches[0];
    swipeStart.current = { x: t.clientX, y: t.clientY };
  };
  const onSwipeEnd = (e) => {
    const st = swipeStart.current;
    swipeStart.current = null;
    if (!st) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - st.x;
    const dy = t.clientY - st.y;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45) stepStage(dx < 0 ? 1 : -1);
  };

  const handleDragStart = (event) => {
    const app = event.active?.data?.current?.app || null;
    setActiveCard(app);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    const draggedApp = active?.data?.current?.app;
    setActiveCard(null);

    if (!over || !draggedApp) return;

    if (over.id === 'reject-drop-zone') {
      if (canRejectCard(draggedApp)) {
        onDropToReject?.(draggedApp);
      }
      return;
    }

    const targetStageId = over.id;
    if (targetStageId === draggedApp.stage_id) return;

    const targetStage = stages.find((s) => s.id === targetStageId);
    if (!targetStage) return;

    if (canMoveToStage(draggedApp, targetStage)) {
      onDropToStage?.(draggedApp, targetStage);
    }
  };

  const handleDragCancel = () => {
    setActiveCard(null);
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-slate-700">
        <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-medium">Loading Kanban board...</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop / Tablet Kanban Board */}
      <div className="hidden md:block">
        <DndContext
          sensors={sensors}
          collisionDetection={kanbanCollisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div
            className={
              stages.length <= 5
                ? 'grid gap-2.5 pb-1 items-stretch'
                : 'flex gap-2.5 overflow-x-auto pb-2 items-stretch'
            }
            style={
              stages.length <= 5
                ? { gridTemplateColumns: `repeat(${Math.max(stages.length, 1)}, minmax(0, 1fr))` }
                : undefined
            }
          >
            {stages.map((stage, idx) => {
              const col = columns[stage.id] || { items: [], total: stage.applicants_count || 0, has_more: false };
              const blocked = activeCard ? !canMoveToStage(activeCard, stage) : false;

              return (
                <div
                  key={stage.id}
                  className={stages.length > 5 ? 'min-w-[230px] w-[230px] shrink-0' : 'min-w-0'}
                >
                  <KanbanColumn
                    stage={stage}
                    index={idx}
                    items={col.items || []}
                    count={stage.applicants_count ?? col.total ?? 0}
                    hasMore={Boolean(col.has_more)}
                    loadingMore={Boolean(loadingMoreMap?.[stage.id])}
                    showJobBadge={showJobBadge}
                    recruiters={recruiters}
                    isBlockedTarget={blocked}
                    wide={stages.length === 1}
                    onQuickAssign={onQuickAssign}
                    onLoadMore={onLoadMoreColumn}
                    onOpenDetail={onOpenDetail}
                    onOpenResume={onOpenResume}
                  />
                </div>
              );
            })}
          </div>

          {/* Bottom Reject Candidate Drop Zone */}
          {rejectedStage && (
            <RejectDropZone
              isDragging={Boolean(activeCard)}
              isBlocked={Boolean(activeCard && !canRejectCard(activeCard))}
            />
          )}

          <DragOverlay dropAnimation={null}>
            {activeCard ? (
              <KanbanCardContent
                app={activeCard}
                showJobBadge={showJobBadge}
                isOverlay={true}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Mobile Fallback: List view with stage dropdown */}
      <div className="md:hidden space-y-3">
        {/* Stage switcher: previous / current (opens the full list) / next. Swiping the list also switches. */}
        <div className="flex items-stretch gap-2" role="group" aria-label="Pipeline stage">
          <button
            type="button"
            onClick={() => stepStage(-1)}
            disabled={phoneIndex === 0}
            aria-label="Previous stage"
            className="w-11 min-h-[46px] shrink-0 inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-700 disabled:opacity-40"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => setStagePickerOpen(true)}
            aria-haspopup="dialog"
            className="flex-1 min-w-0 min-h-[46px] inline-flex items-center justify-between gap-2 px-3.5 rounded-xl bg-blue-600 text-white font-semibold text-sm shadow-sm"
          >
            <span className="truncate">{phoneTabs[phoneIndex].name}</span>
            <span className="inline-flex items-center gap-1.5 shrink-0">
              <span className="px-2 rounded-full bg-blue-700 text-xs">{phoneTabs[phoneIndex].count}</span>
              <ChevronDown size={16} />
            </span>
          </button>
          <button
            type="button"
            onClick={() => stepStage(1)}
            disabled={phoneIndex === phoneTabs.length - 1}
            aria-label="Next stage"
            className="w-11 min-h-[46px] shrink-0 inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white text-slate-700 disabled:opacity-40"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="text-center text-[0.75rem] text-slate-500 font-medium -mt-1">
          Stage {phoneIndex + 1} of {phoneTabs.length} · swipe to switch
        </div>

        {stagePickerOpen && (
          <Modal sheet title="Go to stage" onClose={() => setStagePickerOpen(false)} closeOnOverlay>
            <div className="flex flex-col gap-1.5">
              {phoneTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => { setPhoneStage(tab.id); setStagePickerOpen(false); }}
                  className={`flex items-center justify-between min-h-[48px] px-3.5 rounded-xl border text-sm font-semibold text-left ${
                    phoneActive === tab.id
                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                      : 'bg-white border-gray-200 text-slate-800'
                  }`}
                >
                  <span>{tab.name}</span>
                  <span className="inline-flex items-center gap-2">
                    <span className="px-2 rounded-full bg-gray-100 text-xs text-slate-700">{tab.count}</span>
                    {phoneActive === tab.id && <Check size={16} />}
                  </span>
                </button>
              ))}
            </div>
          </Modal>
        )}

        <div onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd} className="space-y-3">
        {phoneCards.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-slate-700 text-xs font-medium">
            {phoneActive === 'ALL'
              ? 'No applicants found in the active pipeline.'
              : `No applicants in ${stages.find((st) => st.id === phoneActive)?.name || 'this stage'}.`}
          </div>
        ) : (
          phoneCards.map((app) => {
            const canRejectThis = canRejectCard(app);
            return (
              <div
                key={app.id}
                className="bg-white rounded-xl border border-gray-200 p-3.5 shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-gray-900 truncate">
                      {app.candidate_name}
                    </div>
                    <div className="text-xs text-slate-700 truncate font-medium">{app.candidate_email}</div>
                    <div className="text-xs font-medium text-gray-700 mt-1 truncate">
                      {app.job_title} • {app.department_name || 'General'}
                    </div>
                  </div>
                  <span className="text-[0.8125rem] text-slate-700 inline-flex items-center gap-1 shrink-0 font-medium">
                    <Clock size={13} />
                    {app.days_in_stage === 0 ? 'Today' : `${app.days_in_stage}d`}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                  <select
                    value={app.stage_id}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'REJECT') {
                        onDropToReject?.(app);
                        return;
                      }
                      const targetStage = stages.find((s) => s.id === val);
                      if (targetStage && targetStage.id !== app.stage_id) {
                        onDropToStage?.(app, targetStage);
                      }
                    }}
                    className="flex-1 min-w-0 text-base font-semibold bg-gray-50 border border-gray-300 rounded-lg px-2.5 py-2.5 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {stages.map((st) => {
                      const allowed = st.id === app.stage_id || canMoveToStage(app, st);
                      return (
                        <option key={st.id} value={st.id} disabled={!allowed}>
                          {st.name} {!allowed ? '(Admin only)' : ''}
                        </option>
                      );
                    })}
                    {rejectedStage && (
                      <option value="REJECT" disabled={!canRejectThis}>
                        Reject Candidate {!canRejectThis ? '(Admin only)' : ''}
                      </option>
                    )}
                  </select>

                  <button
                    type="button"
                    onClick={() => onOpenDetail?.(app.id)}
                    className="btn btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1 shrink-0 min-h-[44px]"
                  >
                    <span>Review</span>
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}

        </div>

        {/* Load more buttons for columns that have more items on mobile */}
        {stages.some((st) => columns[st.id]?.has_more && (phoneActive === 'ALL' || phoneActive === st.id)) && (
          <div className="flex flex-wrap gap-2 justify-center pt-1">
            {stages.map((st) =>
              columns[st.id]?.has_more && (phoneActive === 'ALL' || phoneActive === st.id) ? (
                <button
                  key={st.id}
                  type="button"
                  disabled={loadingMoreMap?.[st.id]}
                  onClick={() => onLoadMoreColumn?.(st.id)}
                  className="btn btn-secondary text-xs py-1.5 px-3"
                >
                  Load more {st.name}
                </button>
              ) : null
            )}
          </div>
        )}
      </div>
    </>
  );
}
