import { FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PageTitle from '../components/PageTitle';
import DocumentChecklist from '../components/documents/DocumentChecklist';
import OtherDocuments from '../components/documents/OtherDocuments';
import './Company.css';
import './EmployeeDocuments.css';

export default function Documents() {
  const { user } = useAuth();

  return (
    <div className="animate-fade-in company-page">
      <PageTitle icon={FileText} title="My Documents" subtitle="Your employment records, ID proofs and contracts" />
      {user?.employee_id ? (
        <>
          <div className="section-card" style={{ marginBottom: 24 }}>
            <div className="doc-head"><h2>Required documents</h2></div>
            <DocumentChecklist employeeId={user.employee_id} />
          </div>
          <div className="section-card">
            <OtherDocuments employeeId={user.employee_id} />
          </div>
        </>
      ) : (
        <p className="doc-muted">No employee record is linked to this login.</p>
      )}
    </div>
  );
}
