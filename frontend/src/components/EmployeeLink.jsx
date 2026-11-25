import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canViewEmployees } from '../utils/access';

// An employee's name, linked to their profile when the viewer may open it.
export default function EmployeeLink({ id, children }) {
  const { user } = useAuth();
  if (!id || !canViewEmployees(user)) return <>{children}</>;
  return <Link to={`/employees/${id}`} className="employee-link">{children}</Link>;
}
