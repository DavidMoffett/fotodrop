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
  const [collectionName, setCollectionName] = useState('PhotoDeck')
  const [eventName, setEventName] = useState('Uploaded Images')
  const [singleImagePrice, setSingleImagePrice] = useState('7')
  const [watermarkText, setWatermarkText] = useState('PhotoDeck')
  const [photos, setPhotos] = useState([])
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

  function handleReset() {
    setCollectionName('PhotoDeck')
    setEventName('Uploaded Images')
    setSingleImagePrice('7')
    setWatermarkText('PhotoDeck')
    setPhotos([])
    setSelectedPhoto(null)
    setLoadStatus('No images loaded yet')
    setUploadStatus('No upload yet')
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

  return (
    <main className="deck-page">
      <section className="deck-shell">
        <header className="deck-header">
          <button className="brand-button" type="button" aria-label="PhotoDeck">
            PhotoDeck
          </button>

          <nav className="deck-nav" aria-label="Image controls">
            <button type="button" onClick={handleLoadSavedImages}>
              Load saved images
            </button>
            <button type="button" onClick={handleReset}>
              Reset
            </button>
          </nav>
        </header>

        <section className="studio-view">
          <div className="studio-title-row">
            <h1 className="collections-title">Uploaded Images</h1>
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
                View name
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
            <div className="empty-photo-space">
              <strong>{uploadStatus}</strong>
              <br />
              <span>{loadStatus}</span>
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
                  {selectedPhoto.displayKey || 'Image key not available'}
                </p>

                <p>
                  {formatUploadedTime(selectedPhoto.uploadedTime)}
                </p>

                <button type="button" onClick={handlePurchasePlaceholder}>
                  Purchase later
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