import { useState } from 'react'
import './App.css'

function makeSafeId(value, fallback) {
  const text = value ? String(value).trim().toLowerCase() : ''

  const safe = text
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return safe || fallback
}

function App() {
  const [view, setView] = useState('studio')
  const [galleryName, setGalleryName] = useState('Brackenfield')
  const [eventName, setEventName] = useState('Champagne Breakfast')
  const [singleImagePrice, setSingleImagePrice] = useState('7')
  const [watermarkText, setWatermarkText] = useState('FotoDeck')
  const [photos, setPhotos] = useState([])
  const [customer, setCustomer] = useState(null)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [d1ProofStatus, setD1ProofStatus] = useState('Not checked')
  const [d1ProofImage, setD1ProofImage] = useState(null)
  const [uploadStatus, setUploadStatus] = useState('No upload yet')

  async function handlePhotoSelection(event) {
    const files = Array.from(event.target.files || [])

    if (files.length === 0) {
      return
    }

    setUploadStatus(`Uploading ${files.length} image${files.length === 1 ? '' : 's'}...`)

    const collectionId = makeSafeId(galleryName, 'default-collection')
    const eventId = makeSafeId(eventName, 'default-event')
    const uploadedPhotos = []

    for (const file of files) {
      const formData = new FormData()

      formData.append('file', file)
      formData.append('collectionId', collectionId)
      formData.append('collectionName', galleryName || 'Untitled Collection')
      formData.append('eventId', eventId)
      formData.append('eventName', eventName || 'Untitled Event')
      formData.append('watermarkText', watermarkText || 'FotoDeck')
      formData.append('price', singleImagePrice || '0')

      const response = await fetch('/api/upload-display', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok || !result.ok || !result.image) {
        setUploadStatus(result.error || 'Upload failed')
        event.target.value = ''
        return
      }

      uploadedPhotos.push({
        id: result.image.id,
        name: result.image.file_name || file.name,
        previewUrl: URL.createObjectURL(file),
        displayKey: result.image.display_key,
        eventName: result.image.event_name,
        collectionName: result.image.collection_name,
        priceCents: result.image.price_cents,
      })
    }

    setPhotos((currentPhotos) => [...currentPhotos, ...uploadedPhotos])
    setUploadStatus(`Uploaded ${uploadedPhotos.length} image${uploadedPhotos.length === 1 ? '' : 's'} to R2 and D1`)
    event.target.value = ''
  }

  async function handleD1ImageProof() {
    setD1ProofStatus('Checking D1 images read...')
    setD1ProofImage(null)

    try {
      const response = await fetch('/api/images')
      const result = await response.json()

      if (!response.ok || !result.ok || !result.images || result.images.length === 0) {
        setD1ProofStatus(result.error || 'D1 images read failed')
        return
      }

      const image = result.images[0]

      setD1ProofImage(image)
      setGalleryName(image.collection_name || 'Brackenfield')
      setEventName(image.event_name || 'Champagne Breakfast')
      setSingleImagePrice(String((image.price_cents || 0) / 100))
      setWatermarkText(image.watermark_text || 'FotoDeck')
      setD1ProofStatus('D1 images read passed')
    } catch (error) {
      setD1ProofStatus(error.message || 'D1 images read failed')
    }
  }

  function handleCustomerEntry(event) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    setCustomer({
      name: formData.get('customerName'),
      phone: formData.get('customerPhone'),
      email: formData.get('customerEmail'),
    })

    setView('gallery-wall')
  }

  function resetConcept() {
    setView('studio')
    setGalleryName('Brackenfield')
    setEventName('Champagne Breakfast')
    setSingleImagePrice('7')
    setWatermarkText('FotoDeck')
    setPhotos([])
    setCustomer(null)
    setSelectedPhoto(null)
    setD1ProofStatus('Not checked')
    setD1ProofImage(null)
    setUploadStatus('No upload yet')
  }

  function handleAdminReturn() {
    const answer = window.prompt('Security word')

    if (answer && answer.trim().toLowerCase() === 'funga safari') {
      setSelectedPhoto(null)
      setView('studio')
    }
  }

  function handlePurchaseStart(photo) {
    setSelectedPhoto(photo)
  }

  function handlePurchasePlaceholder() {
    window.alert('Purchase flow next: this will connect to Cloudflare-backed payment/delivery logic.')
  }

  function renderWatermark(text) {
    const mark = text && String(text).trim() ? text.trim() : 'FotoDeck'
    const items = Array.from({ length: 12 }, (_, index) => `${mark}-${index}`)

    return (
      <div className="watermark-layer" aria-hidden="true">
        {items.map((item) => (
          <span key={item}>{mark}</span>
        ))}
      </div>
    )
  }

  const tileImage = photos[0]?.previewUrl || null
  const isStudioView = view === 'studio'

  return (
    <main className="deck-page">
      <section className="deck-shell">
        <header className="deck-header">
          <button
            className="brand-button"
            type="button"
            onClick={() => {
              if (isStudioView) {
                setView('studio')
              }
            }}
            aria-label="FotoDeck"
          >
            FotoDeck
          </button>

          {isStudioView && (
            <nav className="deck-nav" aria-label="View selector">
              <button type="button" onClick={() => setView('studio')}>
                Studio
              </button>
              <button type="button" onClick={() => setView('entry')}>
                Customer view
              </button>
              <button type="button" onClick={resetConcept}>
                Reset
              </button>
            </nav>
          )}

          {!isStudioView && (
            <button
              type="button"
              onClick={handleAdminReturn}
              aria-label="Admin return"
              title=""
              style={{
                width: '9px',
                height: '9px',
                padding: 0,
                border: 0,
                borderRadius: '999px',
                background: 'rgba(34, 34, 34, 0.22)',
                cursor: 'pointer',
              }}
            />
          )}
        </header>

        {view === 'studio' && (
          <section className="studio-view">
            <div className="studio-title-row">
              <h1 className="collections-title">Collections</h1>
            </div>

            <section className="studio-panel">
              <div className="studio-fields">
                <label>
                  Gallery
                  <input
                    type="text"
                    value={galleryName}
                    placeholder="Brackenfield"
                    onChange={(event) => setGalleryName(event.target.value)}
                  />
                </label>

                <label>
                  Event
                  <input
                    type="text"
                    value={eventName}
                    placeholder="Champagne Breakfast"
                    onChange={(event) => setEventName(event.target.value)}
                  />
                </label>

                <label>
                  Image price
                  <input
                    type="number"
                    min="0"
                    value={singleImagePrice}
                    onChange={(event) => setSingleImagePrice(event.target.value)}
                  />
                </label>

                <label>
                  Watermark
                  <input
                    type="text"
                    value={watermarkText}
                    placeholder="Watermark text"
                    onChange={(event) => setWatermarkText(event.target.value)}
                  />
                </label>
              </div>

              <div className="photo-loader">
                <label className="photo-loader-button" htmlFor="photo-upload">
                  Add images
                </label>

                <input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoSelection}
                />

                <button className="photo-loader-button" type="button" onClick={handleD1ImageProof}>
                  Read D1 images read
                </button>
              </div>
            </section>

            <section className="studio-preview">
              <div className="preview-heading">
                <button
                  className="dark-action"
                  type="button"
                  onClick={() => setView('entry')}
                  disabled={photos.length === 0}
                >
                  Open customer view
                </button>
              </div>

              <div className="empty-photo-space">
                <strong>{uploadStatus}</strong>
              </div>

              <div className="empty-photo-space">
                <strong>{d1ProofStatus}</strong>

                {d1ProofImage && (
                  <>
                    <br />
                    File: {d1ProofImage.file_name}
                    <br />
                    Gallery: {d1ProofImage.collection_name}
                    <br />
                    Event: {d1ProofImage.event_name}
                    <br />
                    Price: NZ${singleImagePrice}
                    <br />
                    Display key: {d1ProofImage.display_key}
                  </>
                )}
              </div>

              {photos.length === 0 && (
                <div className="empty-photo-space">
                  Uploaded images will appear here.
                </div>
              )}

              {photos.length > 0 && (
                <div className="image-mosaic">
                  {photos.map((photo) => (
                    <article className="mosaic-card" key={photo.id}>
                      <img src={photo.previewUrl} alt={photo.name} />
                      {renderWatermark(watermarkText)}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        )}

        {view === 'entry' && (
          <section className="entry-view">
            <div className="entry-card">
              <p className="soft-label">
                FotoDeck
              </p>

              <h1>{galleryName || 'Photo gallery'}</h1>

              <p>
                Enter your details to view the photo wall.
              </p>

              <form className="entry-form" onSubmit={handleCustomerEntry}>
                <label>
                  Name
                  <input name="customerName" type="text" placeholder="Your name" required />
                </label>

                <label>
                  Phone
                  <input name="customerPhone" type="tel" placeholder="Your phone number" required />
                </label>

                <label>
                  Email
                  <input name="customerEmail" type="email" placeholder="you@example.com" required />
                </label>

                <button className="dark-action" type="submit">
                  View photos
                </button>
              </form>
            </div>
          </section>
        )}

        {view === 'gallery-wall' && (
          <section className="collection-view">
            <div className="collection-heading">
              <div>
                <p className="soft-label">
                  FotoDeck
                </p>

                <h1>Collections</h1>

                {customer && (
                  <p className="customer-line">
                    Welcome, {customer.name}
                  </p>
                )}
              </div>
            </div>

            <div className="wall-grid-five">
              <article className="wall-tile" role="button" tabIndex="0" onClick={() => setView('event-wall')}>
                {tileImage && <img src={tileImage} alt={galleryName || 'Gallery'} />}
                {tileImage && renderWatermark(watermarkText)}

                <div className="wall-tile-label">
                  {galleryName || 'Gallery'}
                </div>
              </article>

              <article className="empty-wall-tile" />
              <article className="empty-wall-tile" />
              <article className="empty-wall-tile" />
              <article className="empty-wall-tile" />
            </div>
          </section>
        )}

        {view === 'event-wall' && (
          <section className="collection-view">
            <div className="collection-heading">
              <div>
                <p className="soft-label">
                  {galleryName || 'Gallery'}
                </p>

                <h1>Events</h1>
              </div>
            </div>

            <div className="wall-grid-five">
              <article
                className="wall-tile wall-tile-stacked"
                role="button"
                tabIndex="0"
                onClick={() => setView('images')}
              >
                <div className="wall-tile-media">
                  {tileImage && <img src={tileImage} alt={eventName || 'Event'} />}
                  {tileImage && renderWatermark(watermarkText)}
                </div>

                <div className="wall-tile-name-below">
                  {eventName || 'Event'}
                </div>
              </article>

              <article className="empty-wall-tile" />
              <article className="empty-wall-tile" />
              <article className="empty-wall-tile" />
              <article className="empty-wall-tile" />
            </div>

            <button className="back-button" type="button" onClick={() => setView('gallery-wall')}>
              Back to galleries
            </button>
          </section>
        )}

        {view === 'images' && (
          <section className="collection-view">
            <div className="collection-heading">
              <div>
                <p className="soft-label">
                  {galleryName || 'Gallery'} / {eventName || 'Event'}
                </p>

                <h1>Images</h1>
              </div>

              <div className="price-mark">
                NZ${singleImagePrice || '0'}
              </div>
            </div>

            {photos.length === 0 && (
              <div className="empty-photo-space">
                No images have been added yet.
              </div>
            )}

            {photos.length > 0 && (
              <div className="customer-grid">
                {photos.map((photo) => (
                  <article className="customer-photo" key={photo.id}>
                    <button type="button" onClick={() => setSelectedPhoto(photo)}>
                      <img src={photo.previewUrl} alt={photo.name} />
                      {renderWatermark(watermarkText)}
                    </button>

                    <div className="buy-row">
                      <span>{photo.name}</span>
                      <button type="button" onClick={() => handlePurchaseStart(photo)}>
                        Buy NZ${singleImagePrice || '0'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <button className="back-button" type="button" onClick={() => setView('event-wall')}>
              Back to events
            </button>
          </section>
        )}

        {selectedPhoto && (
          <section className="lightbox" aria-label="Selected photo">
            <div className="lightbox-card">
              <div className="lightbox-top">
                <span>{selectedPhoto.name}</span>

                <button type="button" onClick={() => setSelectedPhoto(null)}>
                  Close
                </button>
              </div>

              <div className="lightbox-image">
                <div className="lightbox-photo-frame">
                  <img src={selectedPhoto.previewUrl} alt={selectedPhoto.name} />
                  {renderWatermark(watermarkText)}
                </div>
              </div>

              <div className="lightbox-bottom">
                <p>
                  Buy this image for NZ${singleImagePrice || '0'}
                </p>

                <button type="button" onClick={handlePurchasePlaceholder}>
                  Confirm purchase
                </button>
              </div>
            </div>
          </section>
        )}
      </section>
    </main>
  )
}

export default App
