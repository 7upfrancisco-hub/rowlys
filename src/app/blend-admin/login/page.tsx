import { Suspense } from "react";
import LoginForm from "./login-form";

export default function BlendAdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
