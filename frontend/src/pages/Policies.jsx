import { ScrollText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ManagePolicies from '../components/policies/ManagePolicies';
import PageTitle from '../components/PageTitle';
import ReadPolicies from '../components/policies/ReadPolicies';
import useUrlFilters from '../utils/useUrlFilters';
import './Company.css';

export default function Policies() {
  const { user } = useAuth();
  const canManage = !!user?.permissions?.['settings:write'];
  const [filters, setFilters] = useUrlFilters({ tab: 'read', policy: '' });
  const tab = canManage && filters.tab === 'manage' ? 'manage' : 'read';

  return (
    <div className="animate-fade-in company-page">
      <PageTitle icon={ScrollText} title="Company Policies" subtitle="Rules, terms and policies of your company" />
      {canManage && (
        <div className="tabs">
          {[['read', 'Policies'], ['manage', 'Manage']].map(([id, label]) => (
            <button
              key={id} type="button" className={`tab${tab === id ? ' active' : ''}`}
              onClick={() => setFilters({ tab: id, policy: '' })}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === 'manage' ? <ManagePolicies /> : <ReadPolicies />}
    </div>
  );
}
