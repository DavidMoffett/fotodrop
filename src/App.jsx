import { useState } from 'react'
import './App.css'

function makeSafeId(value, fallback) {
  const text = value ? String(value).trim().toLowerCase() : ''

  const safe = text
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return safe || fallback
}

function makeDisplayImageUrl(displayKey) {
  if (!displayKey) {
    return ''
  }

  return `/api/display-image?key=${encodeURIComponent(displayKey)}`
}

function formatUploadedTime(value) {
  if (!value) {
    return 'Uploaded time not available'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return date.toLocaleString()
}

function getUploadedTime(image) {
  return (
    image.uploaded_at ||
    image.created_at ||
    image.inserted_at ||
    image.saved_at ||
    image.createdAt ||
    image.uploadedAt ||
    ''
  )
}

function App() {
  const [view, setView] = useState('studio')
  const [collectionName, setCollectionName] = useState('PhotoDeck')
  const [eventName, setEventName] = useState('Uploaded Images')
  const [singleImagePrice, setSingleImagePrice] = useState('7')
  const [watermarkText, setWatermarkText] = useState('PhotoDeck')
  const [photos, setPhotos] = useState([])
  const [customer, setCustomer] = useState(null)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [loadStatus, setLoadStatus] = useState('No images loaded yet')
  const [uploadStatus, setUploadStatus] = useState('No upload yet')

  function mapSavedImageToPhoto(image) {
    return {
      id: image.id || image.display_key || image.file_name,
      name: image.file_name || image.name || 'Unnamed image',
      previewUrl: makeDisplayImageUrl(image.display_key),
      displayKey: image.display_key || '',
      eventName: image.event_name || '',
      collectionName: image.collection_name || '',
      priceCents: image.price_cents || 0,
      uploadedTime: getUploadedTime(image),
      watermarkText: image.watermark_text || '',
    }
  }

  async function handlePhotoSelection(event) {
    const files = Array.from(event.target.files || [])

    if (files.length === 0) {
      return
    }

    setUploadStatus(`Uploading ${files.length} image${files.length === 1 ? '' : 's'}...`)

    const collectionId = makeSafeId(collectionName, 'photodeck')
    const eventId = makeSafeId(eventName, 'uploaded-images')
    const uploadedPhotos = []

    for (const file of files) {
      const formData = new FormData()

      formData.append('file', file)
      formData.append('collectionId', collectionId)
      formData.append('collectionName', collectionName || 'PhotoDeck')
      formData.append('eventId', eventId)
      formData.append('eventName', eventName || 'Uploaded Images')
      formData.append('watermarkText', watermarkText || 'PhotoDeck')
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

      uploadedPhotos.push(mapSavedImageToPhoto(result.image))
    }

    setPhotos((currentPhotos) => [...uploadedPhotos, ...currentPhotos])
    setUploadStatus(`Uploaded ${uploadedPhotos.length} image${uploadedPhotos.length === 1 ? '' : 's'} to R2 and D1`)
    setLoadStatus(`${uploadedPhotos.length} new image${uploadedPhotos.length === 1 ? '' : 's'} added`)
    event.target.value = ''
  }

  async function handleLoadSavedImages() {
    setLoadStatus('Loading saved images...')

    try {
      const response = await fetch('/api/images')
      const result = await response.json()

      if (!response.ok || !result.ok || !result.images || result.images.length === 0) {
        setLoadStatus(result.error || 'No saved images found')
        return
      }

      const savedPhotos = result.images.map(mapSavedImageToPhoto)

      setPhotos(savedPhotos)
      setLoadStatus(`Loaded ${savedPhotos.length} saved image${savedPhotos.length === 1 ? '' : 's'}`)
    } catch (error) {
      setLoadStatus(error.message || 'Saved images could not be loaded')
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

  function handleReset() {
    setView('studio')
    setCollectionName('PhotoDeck')
    setEventName('Uploaded Images')
    setSingleImagePrice('7')
    setWatermarkText('PhotoDeck')
    setPhotos([])
    setCustomer(null)
    setSelectedPhoto(null)
    setLoadStatus('No images loaded yet')
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
    window.alert('Purchase flow next. Not connected yet.')
  }

  function renderWatermark(text) {
    const mark = text && String(text).trim() ? text.trim() : 'PhotoDeck'
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
            aria-label="PhotoDeck"
          >
            PhotoDeck
          </button>

          {isStudioView && (
            <nav className="deck-nav" aria-label="View selector">
              <button type="button" onClick={() => setView('studio')}>
                Studio
              </button>
              <button type="button" onClick={() => setView('entry')}>
                Customer view
              </button>
              <button type="button" onClick={handleLoadSavedImages}>
                Load saved images
              </button>
              <button type="button" onClick={handleReset}>
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
              <h1 className="collections-title" style={{ fontSize: '1rem' }}>
                Collections
              </h1>
            </div>

            <section className="studio-panel">
              <div className="studio-fields">
                <label>
                  Collection
                  <input
                    type="text"
                    value={collectionName}
                    placeholder="PhotoDeck"
                    onChange={(event) => setCollectionName(event.target.value)}
                  />
                </label>

                <label>
                  Event
                  <input
                    type="text"
                    value={eventName}
                    placeholder="Uploaded Images"
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
                    placeholder="PhotoDeck"
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

                <button className="photo-loader-button" type="button" onClick={handleLoadSavedImages}>
                  Load saved images
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
                <br />
                <span>{loadStatus}</span>
              </div>

              {photos.length === 0 && (
                <div className="empty-photo-space">
                  Uploaded photos will appear here.
                </div>
              )}

              {photos.length > 0 && (
                <div className="image-mosaic">
                  {photos.map((photo) => (
                    <article className="mosaic-card" key={photo.id}>
                      <button type="button" onClick={() => setSelectedPhoto(photo)}>
                        <img src={photo.previewUrl} alt={photo.name} />
                        {renderWatermark(watermarkText)}
                      </button>

                      <div className="buy-row">
                        <span>{photo.name}</span>
                      </div>

                      <div className="empty-photo-space">
                        <strong>Image key</strong>
                        <br />
                        <span>{photo.displayKey || 'Image key not available'}</span>
                        <br />
                        <br />
                        <strong>Uploaded</strong>
                        <br />
                        <span>{formatUploadedTime(photo.uploadedTime)}</span>
                      </div>
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
                PhotoDeck
              </p>

              <h1>{collectionName || 'Photo gallery'}</h1>

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
                  PhotoDeck
                </p>

                <h1 style={{ fontSize: '1rem' }}>Collections</h1>

                {customer && (
                  <p className="customer-line">
                    Welcome, {customer.name}
                  </p>
                )}
              </div>
            </div>

            <div className="wall-grid-five">
              <article className="wall-tile" role="button" tabIndex="0" onClick={() => setView('event-wall')}>
                {tileImage && <img src={tileImage} alt={collectionName || 'Collection'} />}
                {tileImage && renderWatermark(watermarkText)}

                <div className="wall-tile-label">
                  {collectionName || 'Collection'}
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
                  {collectionName || 'Collection'}
                </p>

                <h1 style={{ fontSize: '1rem' }}>Events</h1>
              </div>
            </div>

            <div className="wall-grid-five">
              <article
                className="wall-tile wall-tile-stacked"
                role="button"
                tabIndex="0"
                onClick={() => setView('photos')}
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
              Back to collections
            </button>
          </section>
        )}

        {view === 'photos' && (
          <section className="collection-view">
            <div className="collection-heading">
              <div>
                <p className="soft-label">
                  {collectionName || 'Collection'} / {eventName || 'Event'}
                </p>
              </div>

              <div className="price-mark">
                NZ${singleImagePrice || '0'}
              </div>
            </div>

            {photos.length === 0 && (
              <div className="empty-photo-space">
                No photos have been added yet.
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
                  Buy this photo for NZ${singleImagePrice || '0'}
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