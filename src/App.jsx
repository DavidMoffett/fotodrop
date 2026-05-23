import { useState } from 'react'
import './App.css'

function makeSafeId(value, fallback) {
  const text = value ? String(value).trim().toLowerCase() : ''

  const safe = text
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return safe || fallback
}

function makeDisplayPhotoUrl(displayKey) {
  if (!displayKey) {
    return ''
  }

  return `/api/display-image?key=${encodeURIComponent(displayKey)}`
}

function formatUploadedTime(value) {
  if (!value) {
    return 'Upload time not available'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return date.toLocaleString()
}

function getUploadedTime(photo) {
  return (
    photo.uploaded_at ||
    photo.created_at ||
    photo.inserted_at ||
    photo.saved_at ||
    photo.createdAt ||
    photo.uploadedAt ||
    ''
  )
}

function App() {
  const [view, setView] = useState('studio')
  const [collectionName, setCollectionName] = useState('FOTODECK')
  const [eventName, setEventName] = useState('Event')
  const [singlePhotoPrice, setSinglePhotoPrice] = useState('7')
  const [watermarkText, setWatermarkText] = useState('FOTODECK')
  const [photos, setPhotos] = useState([])
  const [customer, setCustomer] = useState(null)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [loadStatus, setLoadStatus] = useState('No photos loaded yet')
  const [uploadStatus, setUploadStatus] = useState('No upload yet')
  const [uploadProgress, setUploadProgress] = useState(null)
  const [isUploading, setIsUploading] = useState(false)

  function mapSavedPhotoToPhoto(photo) {
    return {
      id: photo.id || photo.display_key || photo.file_name,
      name: photo.file_name || photo.name || 'Unnamed photo',
      previewUrl: makeDisplayPhotoUrl(photo.display_key),
      displayKey: photo.display_key || '',
      eventName: photo.event_name || '',
      collectionName: photo.collection_name || '',
      priceCents: photo.price_cents || 0,
      uploadedTime: getUploadedTime(photo),
      watermarkText: photo.watermark_text || '',
    }
  }

  async function handlePhotoSelection(event) {
    const files = Array.from(event.target.files || [])

    if (files.length === 0) {
      return
    }

    setIsUploading(true)
    setUploadProgress({
      total: files.length,
      completed: 0,
      currentFile: files[0]?.name || '',
    })
    setUploadStatus(`Uploading 0 of ${files.length} photo${files.length === 1 ? '' : 's'}...`)

    const collectionId = makeSafeId(collectionName, 'fotodeck')
    const eventId = makeSafeId(eventName, 'event')
    const uploadedPhotos = []

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]

      setUploadProgress({
        total: files.length,
        completed: index,
        currentFile: file.name || `Photo ${index + 1}`,
      })
      setUploadStatus(`Uploading ${index + 1} of ${files.length}: ${file.name || `Photo ${index + 1}`}`)

      const formData = new FormData()

      formData.append('file', file)
      formData.append('collectionId', collectionId)
      formData.append('collectionName', collectionName || 'FOTODECK')
      formData.append('eventId', eventId)
      formData.append('eventName', eventName || 'Event')
      formData.append('watermarkText', watermarkText || 'FOTODECK')
      formData.append('price', singlePhotoPrice || '0')

      const response = await fetch('/api/upload-display', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok || !result.ok || !result.image) {
        setIsUploading(false)
        setUploadProgress({
          total: files.length,
          completed: uploadedPhotos.length,
          currentFile: file.name || `Photo ${index + 1}`,
        })
        setUploadStatus(result.error || `Upload failed on ${file.name || `photo ${index + 1}`}`)
        event.target.value = ''
        return
      }

      uploadedPhotos.push(mapSavedPhotoToPhoto(result.image))

      setUploadProgress({
        total: files.length,
        completed: index + 1,
        currentFile: file.name || `Photo ${index + 1}`,
      })
      setUploadStatus(`Uploaded ${index + 1} of ${files.length}`)
    }

    setPhotos((currentPhotos) => [...uploadedPhotos, ...currentPhotos])
    setIsUploading(false)
    setUploadProgress({
      total: files.length,
      completed: uploadedPhotos.length,
      currentFile: '',
    })
    setUploadStatus(`Uploaded ${uploadedPhotos.length} photo${uploadedPhotos.length === 1 ? '' : 's'}`)
    setLoadStatus(`${uploadedPhotos.length} new photo${uploadedPhotos.length === 1 ? '' : 's'} added`)
    event.target.value = ''
  }

  async function handleLoadSavedPhotos() {
    setLoadStatus('Loading saved photos...')

    try {
      const response = await fetch('/api/images')
      const result = await response.json()

      if (!response.ok || !result.ok || !result.images || result.images.length === 0) {
        setLoadStatus(result.error || 'No saved photos found')
        return
      }

      const savedPhotos = result.images.map(mapSavedPhotoToPhoto)

      setPhotos(savedPhotos)
      setLoadStatus(`Loaded ${savedPhotos.length} saved photo${savedPhotos.length === 1 ? '' : 's'}`)
    } catch (error) {
      setLoadStatus(error.message || 'Saved photos could not be loaded')
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

    setView('collection-wall')
  }

  function handleReset() {
    const message = isUploading
      ? 'Uploads may still be running in the background. Reset only clears the screen. Continue?'
      : 'Reset the visible screen? Uploaded photos already saved to FOTODECK will not be deleted.'

    const confirmed = window.confirm(message)

    if (!confirmed) {
      return
    }

    setView('studio')
    setCollectionName('FOTODECK')
    setEventName('Event')
    setSinglePhotoPrice('7')
    setWatermarkText('FOTODECK')
    setPhotos([])
    setCustomer(null)
    setSelectedPhoto(null)
    setLoadStatus('No photos loaded yet')
    setUploadStatus('No upload yet')
    setUploadProgress(null)
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
    const mark = text && String(text).trim() ? text.trim() : 'FOTODECK'
    const items = Array.from({ length: 12 }, (_, index) => `${mark}-${index}`)

    return (
      <div className="watermark-layer" aria-hidden="true">
        {items.map((item) => (
          <span key={item}>{mark}</span>
        ))}
      </div>
    )
  }

  const tilePhoto = photos[0]?.previewUrl || null
  const isStudioView = view === 'studio'
  const smallHeadingStyle = {
    fontSize: '0.8rem',
    lineHeight: '1.1',
    letterSpacing: '0.02em',
  }

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
            aria-label="FOTODECK"
          >
            FOTODECK
          </button>

          {isStudioView && (
            <nav className="deck-nav" aria-label="View selector">
              <button type="button" onClick={() => setView('studio')}>
                Studio
              </button>
              <button type="button" onClick={() => setView('entry')}>
                Customer view
              </button>
              <button type="button" onClick={handleLoadSavedPhotos}>
                Load saved photos
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
              <h1 className="collections-title" style={smallHeadingStyle}>
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
                    placeholder="FOTODECK"
                    onChange={(event) => setCollectionName(event.target.value)}
                    disabled={isUploading}
                  />
                </label>

                <label>
                  Event
                  <input
                    type="text"
                    value={eventName}
                    placeholder="Event"
                    onChange={(event) => setEventName(event.target.value)}
                    disabled={isUploading}
                  />
                </label>

                <label>
                  Photo price
                  <input
                    type="number"
                    min="0"
                    value={singlePhotoPrice}
                    onChange={(event) => setSinglePhotoPrice(event.target.value)}
                    disabled={isUploading}
                  />
                </label>

                <label>
                  Fotomark
                  <input
                    type="text"
                    value={watermarkText}
                    placeholder="FOTODECK"
                    onChange={(event) => setWatermarkText(event.target.value)}
                    disabled={isUploading}
                  />
                </label>
              </div>

              <div className="photo-loader">
                <label className="photo-loader-button" htmlFor="photo-upload">
                  {isUploading ? 'Uploading...' : 'Add photos'}
                </label>

                <input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoSelection}
                  disabled={isUploading}
                />

                <button className="photo-loader-button" type="button" onClick={handleLoadSavedPhotos} disabled={isUploading}>
                  Load saved photos
                </button>
              </div>
            </section>

            <section className="studio-preview">
              <div className="preview-heading">
                <button
                  className="dark-action"
                  type="button"
                  onClick={() => setView('entry')}
                  disabled={photos.length === 0 || isUploading}
                >
                  Open customer view
                </button>
              </div>

              <div className="empty-photo-space">
                <strong>{uploadStatus}</strong>
                {uploadProgress && (
                  <>
                    <br />
                    <span>
                      {uploadProgress.completed} of {uploadProgress.total} complete
                    </span>
                    {uploadProgress.currentFile && (
                      <>
                        <br />
                        <span>{uploadProgress.currentFile}</span>
                      </>
                    )}
                  </>
                )}
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
                FOTODECK
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

        {view === 'collection-wall' && (
          <section className="collection-view">
            <div className="collection-heading">
              <div>
                <p className="soft-label">
                  FOTODECK
                </p>

                <h1 style={smallHeadingStyle}>Collections</h1>

                {customer && (
                  <p className="customer-line">
                    Welcome, {customer.name}
                  </p>
                )}
              </div>
            </div>

            <div className="wall-grid-five">
              <article className="wall-tile" role="button" tabIndex="0" onClick={() => setView('event-wall')}>
                {tilePhoto && <img src={tilePhoto} alt={collectionName || 'Collection'} />}
                {tilePhoto && renderWatermark(watermarkText)}

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

                <h1 style={smallHeadingStyle}>Events</h1>
              </div>
            </div>

            <div className="wall-grid-five">
              <article
                className="wall-tile wall-tile-stacked"
                role="button"
                tabIndex="0"
                onClick={() => setView('photo-grid')}
              >
                <div className="wall-tile-media">
                  {tilePhoto && <img src={tilePhoto} alt={eventName || 'Event'} />}
                  {tilePhoto && renderWatermark(watermarkText)}
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

            <button className="back-button" type="button" onClick={() => setView('collection-wall')}>
              Back to collections
            </button>
          </section>
        )}

        {view === 'photo-grid' && (
          <section className="collection-view">
            <div className="collection-heading">
              <div>
                <p className="soft-label">
                  {collectionName || 'Collection'} / {eventName || 'Event'}
                </p>
              </div>

              <div className="price-mark">
                NZ${singlePhotoPrice || '0'}
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
                        Buy NZ${singlePhotoPrice || '0'}
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
                  Buy this photo for NZ${singlePhotoPrice || '0'}
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