import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      expand={true}
      richColors
      theme="dark"
      closeButton
      toastOptions={{
        style: {
          background: 'rgb(38 38 38)',
          border: '1px solid rgb(64 64 64)',
          color: 'white',
        },
        className: 'toast',
        duration: 4000,
      }}
    />
  );
}
