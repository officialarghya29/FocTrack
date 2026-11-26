import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-start justify-center">
      <p className="micro mb-3">404 · off course</p>
      <h1 className="text-3xl font-semibold">This page is not on the map</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        The route you followed does not exist. Your tracked sessions are unaffected.
      </p>
      <Link to="/" className="btn btn-primary mt-6">
        Back to overview
      </Link>
    </div>
  );
}
