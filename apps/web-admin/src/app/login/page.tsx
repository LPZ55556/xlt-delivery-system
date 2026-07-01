export default function LoginPage() {
  return (
    <main className="main">
      <h1 className="page-title">登录</h1>
      <p className="muted">管理员登录页面占位，后续接入认证接口。</p>
      <form className="form">
        <input className="input" placeholder="账号" />
        <input className="input" placeholder="密码" type="password" />
        <button className="button" type="button">登录</button>
      </form>
    </main>
  );
}
