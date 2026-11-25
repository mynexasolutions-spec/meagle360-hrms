export default function PageTitle({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="page-header">
      <div className="company-title">
        <div className="company-icon"><Icon size={22} /></div>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
