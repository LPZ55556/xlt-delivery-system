import { AdminShell } from './AdminShell';

type Props = { title: string; description: string; items?: string[] };

export function PlaceholderPage({ title, description, items = [] }: Props) {
  return <AdminShell><h1 className="page-title">{title}</h1><p className="muted">{description}</p><section className="grid">{items.map((item) => <div className="card" key={item}>{item}</div>)}</section></AdminShell>;
}
