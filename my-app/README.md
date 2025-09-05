# Helixque Frontend

This is the frontend for Helixque, a real-time video chat application built with [Next.js](https://nextjs.org).

## Getting Started

Make sure the backend server is running first (see main README for backend setup).

Then, run the frontend development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or the next available port) with your browser.

**Important**: You'll need to allow camera and microphone permissions for the application to work properly.

## Key Components

- `app/page.tsx` - Landing page
- `app/match/page.tsx` - Device setup and user matching
- `components/RTC/DeviceCheck.tsx` - Camera/microphone setup interface
- `components/RTC/Room.tsx` - Main video chat room component

This project uses WebRTC for peer-to-peer video communication and Socket.IO for real-time signaling.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
