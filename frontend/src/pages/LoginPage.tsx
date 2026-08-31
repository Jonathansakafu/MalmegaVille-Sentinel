import { useSearchParams } from 'react-router-dom';
import AuthCard from '../components/AuthCard';

function LoginPage({ onAuthSuccess }: { onAuthSuccess: (token: string, email: string, username: string) => void }) {
  const [searchParams] = useSearchParams();
  const initialView = searchParams.get('view') === 'register' ? 'register' : 'login';

  return <AuthCard onAuthSuccess={onAuthSuccess} initialView={initialView} />;
}

export default LoginPage;
