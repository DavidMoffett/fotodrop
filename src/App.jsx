import { useState } from 'react'
import './App.css'

function App() {
  const [view, setView] = useState('studio')
  const [galleryName, setGalleryName] = useState('Brackenfield')
  const [eventName, setEventName] = useState('Champagne Breakfast')
  const [singleImagePrice, setSingleImagePrice] = useState('7')
  const [watermarkText, setWatermarkText] = useState('FotoDeck')
  const [photos, setPhotos] = useState([])
  const [customer, setCustomer] = useState(null)
  const [selectedPhoto, setSelectedPhoto] = useState(null)

  function handlePhotoSelection(event) {
    const files = Array.from(event.target.files || [])

    const selectedPhotos = files.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}`,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
    }))

    setPhotos(selectedPhotos)
    event.target.value = ''
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