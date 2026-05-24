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

function getPhotoSortName(photo) {
  return photo?.name || photo?.file_name || photo?.displayKey || photo?.display_key || photo?.id || ''
}

function sortPhotosFirstFirst(photosToSort) {
  return [...photosToSort].sort((firstPhoto, secondPhoto) =>
    getPhotoSortName(firstPhoto).localeCompare(getPhotoSortName(secondPhoto), undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  )
}

function App() {
  const [view, setView] = useState('studio')
  const [collectionName, setCollectionName] = useState('FOTODECK')
  const [eventName, setEventName] = useState('Event')
  const [activeCollectionId, setActiveCollectionId] = useState('')
  const [activeEventId, setActiveEventId] = useState('')
  const [singlePhotoPrice, setSinglePhotoPrice] = useState('7')
  const [watermarkText, setWatermarkText] = useState('FOTODECK')
  const [photos, setPhotos] = useState([])
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [loadStatus, setLoadStatus] = useState('No photos loaded yet')
  const [uploadStatus, setUploadStatus] = useState('No upload yet')
  const [uploadProgress, setUploadProgress] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [savedCollections, setSavedCollections] = useState([])
  const [savedEvents, setSavedEvents] = useState([])
  const [savedStatus, setSavedStatus] = useState('Saved collections not loaded yet')
  const [deleteStatus, setDeleteStatus] = useState('No delete action yet')
  const [deletingPhotoId, setDeletingPhotoId] = useState('')
  const [deletingEventId, setDeletingEventId] = useState('')

  function clearVisiblePhotosForNewTarget() {
    setPhotos([])
    setSelectedPhoto(null)
    setLoadStatus('No photos loaded yet')
    setDeleteStatus('No delete action yet')
  }

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

  function getCurrentCollectionId() {
    return activeCollectionId || makeSafeId(collectionName, 'fotodeck')
  }

  function getCurrentEventId() {
    return activeEventId || makeSafeId(eventName, 'event')
  }

  async function handlePhotoSelection(event) {
    const files = Array.from(event.target.files || [])

    if (files.length === 0) {
      return
    }

    setPhotos([])
    setSelectedPhoto(null)
    setIsUploading(true)
    setUploadProgress({
      total: files.length,
      completed: 0,
      currentFile: files[0]?.name || '',
    })
    setUploadStatus(`Uploading 0 of ${files.length} photo${files.length === 1 ? '' : 's'}...`)

    const collectionId = getCurrentCollectionId()
    const eventId = getCurrentEventId()
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

    const sortedUploadedPhotos = sortPhotosFirstFirst(uploadedPhotos)

    setPhotos(sortedUploadedPhotos)
    setIsUploading(false)
    setUploadProgress({
      total: files.length,
      completed: sortedUploadedPhotos.length,
      currentFile: '',
    })
    setUploadStatus(`Uploaded ${sortedUploadedPhotos.length} photo${sortedUploadedPhotos.length === 1 ? '' : 's'}`)
    setLoadStatus(`${sortedUploadedPhotos.length} photo${sortedUploadedPhotos.length === 1 ? '' : 's'} shown for this event`)
    event.target.value = ''
  }

  async function handleLoadSavedPhotos(collectionIdOverride, eventIdOverride) {
    const collectionId = collectionIdOverride || getCurrentCollectionId()
    const eventId = eventIdOverride || getCurrentEventId()

    setLoadStatus(`Loading saved photos for ${eventName || 'selected event'}...`)

    try {
      const response = await fetch(
        `/api/images?collectionId=${encodeURIComponent(collectionId)}&eventId=${encodeURIComponent(eventId)}`
      )
      const result = await response.json()

      if (!response.ok || !result.ok || !result.images || result.images.length === 0) {
        setPhotos([])
        setLoadStatus(result.error || 'No saved photos found for this event')
        return
      }

      const savedPhotos = sortPhotosFirstFirst(result.images.map(mapSavedPhotoToPhoto))

      setPhotos(savedPhotos)
      setLoadStatus(`Loaded ${savedPhotos.length} saved photo${savedPhotos.length === 1 ? '' : 's'} for this event`)
    } catch (error) {
      setLoadStatus(error.message || 'Saved photos could not be loaded')
    }
  }

  async function handleLoadSavedCollectionsEvents() {
    setSavedStatus('Loading saved collections and events...')

    try {
      const response = await fetch('/api/collections-events')
      const result = await response.json()

      if (!response.ok || !result.ok) {
        setSavedStatus(result.error || 'Saved collections could not be loaded')
        return
      }

      setSavedCollections(result.collections || [])
      setSavedEvents(result.events || [])
      setSavedStatus(
        `Loaded ${result.collectionCount || 0} collection${result.collectionCount === 1 ? '' : 's'} and ${result.eventCount || 0} event${result.eventCount === 1 ? '' : 's'}`
      )
    } catch (error) {
      setSavedStatus(error.message || 'Saved collections could not be loaded')
    }
  }

  async function handleSelectSavedEvent(collection, event) {
    setActiveCollectionId(collection.id)
    setActiveEventId(event.id)
    setCollectionName(collection.name || 'FOTODECK')
    setEventName(event.name || 'Event')
    setPhotos([])
    setSelectedPhoto(null)
    setSavedStatus(`Selected ${collection.name || 'Collection'} / ${event.name || 'Event'}`)
    await handleLoadSavedPhotos(collection.id, event.id)
  }

  async function handleDeletePhoto(photo) {
    const confirmed = window.confirm(
      `Delete this photo from FOTODECK?\n\n${photo.name}\n\nThis removes the saved record and display file.`
    )

    if (!confirmed) {
      return
    }

    setDeletingPhotoId(photo.id)
    setDeleteStatus(`Deleting ${photo.name}...`)

    try {
      const response = await fetch('/api/delete-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageId: photo.id,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.ok) {
        setDeleteStatus(result.error || `Could not delete ${photo.name}`)
        setDeletingPhotoId('')
        return
      }

      setPhotos((currentPhotos) => currentPhotos.filter((item) => item.id !== photo.id))

      if (selectedPhoto && selectedPhoto.id === photo.id) {
        setSelectedPhoto(null)
      }

      setDeleteStatus(`Deleted ${photo.name}`)
      setDeletingPhotoId('')
    } catch (error) {
      setDeleteStatus(error.message || `Could not delete ${photo.name}`)
      setDeletingPhotoId('')
    }
  }

  async function handleDeleteEvent(collection, event) {
    const firstConfirm = window.confirm(
      `Delete this event from FOTODECK?\n\nCollection: ${collection.name || 'Collection'}\nEvent: ${event.name || 'Event'}\nPhotos: ${event.photo_count || 0}\n\nThis deletes the selected event/group and its photos. It does not delete the collection.`
    )

    if (!firstConfirm) {
      return
    }

    const typedConfirm = window.prompt(
      `Final confirmation for deleting event:\n\n${event.name || 'Event'}\n\nType DELETE EVENT to continue.`
    )

    if (typedConfirm !== 'DELETE EVENT') {
      setDeleteStatus('Event delete cancelled')
      return
    }

    setDeletingEventId(event.id)
    setDeleteStatus(`Deleting event ${event.name || 'Event'}...`)

    try {
      const response = await fetch('/api/delete-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collectionId: collection.id,
          eventId: event.id,
          confirmText: 'DELETE EVENT',
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.ok) {
        setDeleteStatus(result.error || `Could not delete event ${event.name || 'Event'}`)
        setDeletingEventId('')
        return
      }

      setSavedEvents((currentEvents) => currentEvents.filter((item) => item.id !== event.id))

      setSavedCollections((currentCollections) =>
        currentCollections.map((item) => {
          if (item.id !== collection.id) {
            return item
          }

          const deletedPhotoCount = event.photo_count || 0
          const currentPhotoCount = item.photo_count || 0

          return {
            ...item,
            photo_count: Math.max(0, currentPhotoCount - deletedPhotoCount),
          }
        })
      )

      if (activeCollectionId === collection.id && activeEventId === event.id) {
        setActiveEventId('')
        setEventName('Event')
        setPhotos([])
        setSelectedPhoto(null)
        setLoadStatus('Deleted event removed from current view')
      }

      setDeleteStatus(`Deleted event ${event.name || 'Event'}`)
      setSavedStatus(`Deleted ${collection.name || 'Collection'} / ${event.name || 'Event'}`)
      setDeletingEventId('')
    } catch (error) {
      setDeleteStatus(error.message || `Could not delete event ${event.name || 'Event'}`)
      setDeletingEventId('')
    }
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
    setActiveCollectionId('')
    setActiveEventId('')
    setSinglePhotoPrice('7')
    setWatermarkText('FOTODECK')
    setPhotos([])
    setSelectedPhoto(null)
    setLoadStatus('No photos loaded yet')
    setUploadStatus('No upload yet')
    setUploadProgress(null)
    setDeleteStatus('No delete action yet')
    setDeletingPhotoId('')
    setDeletingEventId('')
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
              <button type="button" onClick={() => setView('collection-wall')}>
                Customer view
              </button>
              <button type="button" onClick={() => handleLoadSavedPhotos()}>
                Load current event
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
                    onChange={(event) => {
                      setCollectionName(event.target.value)
                      setActiveCollectionId('')
                      clearVisiblePhotosForNewTarget()
                    }}
                    disabled={isUploading}
                  />
                </label>

                <label>
                  Event
                  <input
                    type="text"
                    value={eventName}
                    placeholder="Event"
                    onChange={(event) => {
                      setEventName(event.target.value)
                      setActiveEventId('')
                      clearVisiblePhotosForNewTarget()
                    }}
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

                <button className="photo-loader-button" type="button" onClick={() => handleLoadSavedPhotos()} disabled={isUploading}>
                  Load current event
                </button>
              </div>
            </section>

            <section className="studio-panel">
              <div className="preview-heading">
                <div>
                  <p className="soft-label">
                    Saved
                  </p>
                  <h1 style={smallHeadingStyle}>Collections / Events</h1>
                </div>

                <button className="dark-action" type="button" onClick={handleLoadSavedCollectionsEvents} disabled={isUploading}>
                  Load saved list
                </button>
              </div>

              <div className="empty-photo-space">
                <strong>{savedStatus}</strong>
              </div>

              {savedCollections.length > 0 && (
                <div className="studio-view">
                  {savedCollections.map((collection) => {
                    const collectionEvents = savedEvents.filter((event) => event.collection_id === collection.id)

                    return (
                      <section className="studio-preview" key={collection.id}>
                        <div className="preview-heading">
                          <div>
                            <p className="soft-label">
                              Collection
                            </p>
                            <h1 style={smallHeadingStyle}>{collection.name}</h1>
                          </div>

                          <div className="price-mark">
                            {collection.photo_count} photo{collection.photo_count === 1 ? '' : 's'}
                          </div>
                        </div>

                        {collectionEvents.length === 0 && (
                          <div className="empty-photo-space">
                            No events saved for this collection.
                          </div>
                        )}

                        {collectionEvents.length > 0 && (
                          <div className="image-mosaic">
                            {collectionEvents.map((event) => (
                              <article className="mosaic-card" key={event.id}>
                                <button type="button" onClick={() => handleSelectSavedEvent(collection, event)} disabled={isUploading || deletingEventId === event.id}>
                                  <div className="empty-photo-space">
                                    <strong>{event.name}</strong>
                                    <br />
                                    <span>
                                      {event.photo_count} photo{event.photo_count === 1 ? '' : 's'}
                                    </span>
                                  </div>
                                </button>

                                <div className="buy-row">
                                  <span>{event.id}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteEvent(collection, event)}
                                    disabled={isUploading || deletingEventId === event.id}
                                  >
                                    {deletingEventId === event.id ? 'Deleting...' : 'Delete Event'}
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                        )}
                      </section>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="studio-preview">
              <div className="preview-heading">
                <button
                  className="dark-action"
                  type="button"
                  onClick={() => setView('collection-wall')}
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
                <br />
                <span>{deleteStatus}</span>
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
                        <button
                          type="button"
                          onClick={() => handleDeletePhoto(photo)}
                          disabled={deletingPhotoId === photo.id || isUploading}
                        >
                          {deletingPhotoId === photo.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
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