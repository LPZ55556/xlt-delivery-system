
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { getAccessToken, saveCurrentUser } from '../lib/session';
import type { CurrentUser } from '../lib/types';

type Props = {
  children: (user: CurrentUser) => React.ReactNode;
};

export function RequireAuth({ children }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }

    api.getMe()
      .then((result) => {
        if (!alive) return;
        saveCurrentUser(result.user);
        setUser(result.user);
      })
      .catch(() => {
        if (alive) router.replace('/login');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [router]);

  if (loading) return <main className="main"><p className="muted">正在验证登录状态...</p></main>;
  if (!user) return null;
  return <>{children(user)}</>;
}
