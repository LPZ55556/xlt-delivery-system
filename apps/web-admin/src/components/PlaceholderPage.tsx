
'use client';

import { AdminShell } from './AdminShell';
import { RequireAuth } from './RequireAuth';

type Props = { title: string; description: string; items?: string[] };

export function PlaceholderPage({ title, description, items = [] }: Props) {
  return (
    <RequireAuth>
      {(user) => (
        <AdminShell user={user}>
          <h1 className="page-title">{title}</h1>
          <p className="muted">{description}</p>
          <section className="grid">{items.map((item) => <div className="card" key={item}>{item}</div>)}</section>
        </AdminShell>
      )}
    </RequireAuth>
  );
}
