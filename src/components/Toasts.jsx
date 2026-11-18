// Short, quiet messages for things that happen to the room: someone joined, left, took over as host.
export default function Toasts({ toasts }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <p className="toast" key={t.id}>{t.text}</p>
      ))}
    </div>
  );
}
