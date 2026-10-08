export class PhotoGallery {
  private urls: string[] = [];
  private captures = 0;

  constructor(
    private photos: HTMLElement,
    private count: HTMLElement,
    private camera: HTMLElement,
    private capacity = 6,
  ) {}

  get total(): number {
    return this.captures;
  }

  add(blob: Blob): number {
    const url = URL.createObjectURL(blob);
    if (!this.captures) this.photos.replaceChildren();
    this.captures++;

    const link = document.createElement('a');
    link.href = url;
    link.download = `flight-school-${String(this.captures).padStart(3, '0')}.png`;
    link.title = `Download photo ${this.captures}`;
    link.className = 'photo-thumb';

    const image = document.createElement('img');
    image.src = url;
    image.alt = `Drone camera photo ${this.captures}`;
    link.append(image);
    this.photos.prepend(link);
    this.urls.push(url);

    if (this.urls.length > this.capacity) {
      URL.revokeObjectURL(this.urls.shift()!);
      this.photos.lastElementChild?.remove();
    }

    this.count.textContent = String(this.captures);
    this.camera.classList.add('flash');
    setTimeout(() => this.camera.classList.remove('flash'), 180);
    return this.captures;
  }

  dispose(): void {
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls = [];
  }
}
