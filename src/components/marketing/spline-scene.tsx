"use client";

import { Suspense, lazy } from "react";

// next/dynamic 대신 lazy + Suspense로 처리 (서버 렌더 안 함, 클라이언트 전용)
const Spline = lazy(() => import("@splinetool/react-spline"));

/**
 * Spline 3D 씬 임베드.
 *
 * 사용 방법:
 *   1. spline.design에서 씬 만들고 "Export → Code → React" 클릭
 *   2. 받은 URL (예: https://prod.spline.design/xxxxxx/scene.splinecode) 을 scene prop에 전달
 *   3. 화면에 자동으로 렌더링됨
 *
 * @example
 *   <SplineScene scene="https://prod.spline.design/xxxxx/scene.splinecode" />
 */
export function SplineScene({
  scene,
  className,
}: {
  scene: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-fuchsia-500/30 border-t-fuchsia-400" />
          </div>
        }
      >
        <Spline scene={scene} />
      </Suspense>
    </div>
  );
}
