export default function GalleryNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <p className="font-display text-lg italic text-accent">Cute Wedding Polaroid</p>
      <h1 className="mt-3 font-display text-4xl italic">We couldn&apos;t find these polaroids</h1>
      <p className="mt-4 text-muted">
        Check that you opened the full link from your WhatsApp message. If it still doesn&apos;t work, ask the photo team at the
        wedding to send it again.
      </p>
    </div>
  );
}
