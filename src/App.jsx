import { useEffect, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'fotodrop-local-proof'

function formatDisplayDate(dateValue) {
  if (!dateValue) {
    return ''
  }

  const [year, month, day] = dateValue.split('-')

  return `${day}/${month}/${year}`
}

function formatPrice(priceValue) {
  if (priceValue === '' || priceValue === null || priceValue === undefined) {
    return 'NZ$0'
  }

  return `NZ$${priceValue}`
}

function loadSavedProof() {
  try {
    const savedProof = window.localStorage.getItem(STORAGE_KEY)

    if (!savedProof) {
      return null
    }

    return JSON.parse(savedProof)
  } catch {
    return null
  }
}

function App() {
  const testBrandName = 'KlickPix'
  const savedProof = loadSavedProof()

  const [drop, setDrop] = useState(savedProof?.drop || null)
  const [photos, setPhotos] = useState([])
  const [buyer, setBuyer] = useState(savedProof?.buyer || null)
  const [page, setPage] = useState(savedProof?.page || 'setup')
  const [inspectionPhoto, setInspectionPhoto] = useState(null)

  useEffect(() => {
    const proofToSave = {
      drop,
      buyer,
      page,
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(proofToSave))
  }, [drop, buyer, page])

  function handleCreateDrop(event) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    const newDrop = {
      eventName: formData.get('eventName'),
      photographerName: formData.get('photographerName'),
      singlePhotoPrice: formData.get('singlePhotoPrice'),
      fullEventPrice: formData.get('fullEventPrice'),
      closeDate: formData.get('closeDate'),
    }

    setDrop(newDrop)
    setPhotos([])
    setBuyer(null)
    setInspectionPhoto(null)
    setPage('manage')
  }

  function handleEditDrop() {
    window.localStorage.removeItem(STORAGE_KEY)

    setDrop(null)
    setPhotos([])
    setBuyer(null)
    setInspectionPhoto(null)
    setPage('setup')
  }

  function handlePhotoSelection(event) {
    const selectedFiles = Array.from(event.target.files || [])

    const selectedPhotos = selectedFiles.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}`,
      name: file.name,
      size: file.size,
      previewUrl: URL.createObjectURL(file),
    }))

    setPhotos(selectedPhotos)
    setInspectionPhoto(null)
  }

  function showVisitorDetailsPage() {
    setBuyer(null)
    setInspectionPhoto(null)
    setPage('visitor-details')
  }

  function showEventWallPage() {
    setInspectionPhoto(null)
    setPage('event-wall')
  }

  function showManagePhotosPage() {
    setInspectionPhoto(null)
    setPage('manage')
  }

  function showPhotoPage() {
    setInspectionPhoto(null)
    setPage('public-drop')
  }

  function openInspectionPhoto(photo) {
    setInspectionPhoto(photo)
  }

  function closeInspectionPhoto() {
    setInspectionPhoto(null)
  }

  function handleVisitorDetails(event) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    const newBuyer = {
      name: formData.get('buyerName'),
      phone: formData.get('buyerPhone'),
      email: formData.get('buyerEmail'),
    }

    setBuyer(newBuyer)
    setInspectionPhoto(null)
    setPage('event-wall')
  }

  const wallSlots = [drop, null, null, null, null]

  return (
    <main className="fotodrop-page">
      <section className="hero">
        <div className="eyebrow">FotoDrop engine / KlickPix test</div>

        {page === 'setup' && (
          <>
            <h1>
              <span>Event Photographers</span>
              <span>Photo Drops</span>
              <span className="no-wrap">Only Available for 7 Days</span>
            </h1>

            <p className="lead">
              Launch the event. Sell the moment. Close the drop.
            </p>

            <div className="rule-card">
              <span>One event.</span>
              <span>One drop.</span>
              <span>Seven days.</span>
              <span>Sell hard.</span>
              <span>Close.</span>
            </div>

            <p className="support">
              Built for event photographers who want to sell while people still care —
              without dead galleries, bloated portals, or old platform baggage.
            </p>

            <form className="drop-form" onSubmit={handleCreateDrop}>
              <label>
                Event name
                <input
                  name="eventName"
                  type="text"
                  placeholder="Brackenfield Champers 2026"
                  required
                />
              </label>

              <label>
                Photographer
                <input
                  name="photographerName"
                  type="text"
                  defaultValue={testBrandName}
                  required
                />
              </label>

              <label>
                Single photo price
                <input
                  name="singlePhotoPrice"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue="7"
                  required
                />
              </label>

              <label>
                Full event price
                <input
                  name="fullEventPrice"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue="49"
                  required
                />
              </label>

              <label>
                Drop closes
                <input name="closeDate" type="date" required />
              </label>

              <button className="primary-button" type="submit">
                Create first drop
              </button>
            </form>
          </>
        )}

        {page === 'manage' && drop && (
          <section className="drop-preview">
            <p className="lead">Manage photos</p>

            <h1>
              <span>{drop.eventName}</span>
              <span className="no-wrap">
                Closes {formatDisplayDate(drop.closeDate)}
              </span>
            </h1>

            <div className="rule-card">
              <span>{drop.photographerName}</span>
              <span>{photos.length} photos selected</span>
              <span>{formatPrice(drop.singlePhotoPrice)} single photo</span>
              <span>{formatPrice(drop.fullEventPrice)} full event unlock</span>
            </div>

            <p className="support">
              Select finished, edited event photos. Visitors will enter their details,
              choose an event, then open the photos.
            </p>

            <div className="drop-form">
              <label>
                Select edited event photos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoSelection}
                />
              </label>
            </div>

            {photos.length === 0 && (
              <p className="support">
                If you refreshed the page, reselect photos for this local proof.
                Drop details are saved, but browser photo previews are temporary.
              </p>
            )}

            {photos.length > 0 && (
              <>
                <p className="support">
                  {photos.length} photos are ready.
                </p>

                <button className="primary-button" type="button" onClick={showVisitorDetailsPage}>
                  Preview visitor entry
                </button>
              </>
            )}

            <div className="rule-card">
              <span>Edited photos only</span>
              <span>Visitor details first</span>
              <span>Event wall next</span>
              <span>Photos after event choice</span>
            </div>

            <button className="primary-button" type="button" onClick={handleEditDrop}>
              Back / edit drop
            </button>
          </section>
        )}

        {page === 'visitor-details' && drop && (
          <section className="drop-preview">
            <p className="lead">{testBrandName} Live Event Photos</p>

            <h1>
              <span>View event photos</span>
              <span className="no-wrap">Available for 7 days</span>
            </h1>

            <p className="support">
              Enter your details, then choose the event you want to open.
            </p>

            <form className="drop-form" onSubmit={handleVisitorDetails}>
              <label>
                Name
                <input
                  name="buyerName"
                  type="text"
                  placeholder="Your name"
                  required
                />
              </label>

              <label>
                Phone
                <input
                  name="buyerPhone"
                  type="tel"
                  placeholder="Your phone number"
                  required
                />
              </label>

              <label>
                Email
                <input
                  name="buyerEmail"
                  type="email"
                  placeholder="you@example.com"
                  required
                />
              </label>

              <button className="primary-button" type="submit">
                Continue
              </button>
            </form>

            <button className="primary-button" type="button" onClick={showManagePhotosPage}>
              Back to manage photos
            </button>
          </section>
        )}

        {page === 'event-wall' && drop && buyer && (
          <section className="drop-preview">
            <p className="lead">{testBrandName} Live Event Photos</p>

            <h1>
              <span>Choose your event</span>
              <span className="no-wrap">Open now</span>
            </h1>

            <p className="support">
              Tap the event you want to view.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                gap: '18px',
                marginTop: '38px',
              }}
            >
              {wallSlots.map((slot, index) => {
                if (!slot) {
                  return (
                    <article
                      key={`empty-slot-${index}`}
                      style={{
                        aspectRatio: '1 / 1',
                        border: '1px dashed rgba(148, 163, 184, 0.2)',
                        borderRadius: '22px',
                        background: 'rgba(248, 250, 252, 0.025)',
                      }}
                    />
                  )
                }

                return (
                  <article
                    key="live-drop-card"
                    role="button"
                    tabIndex="0"
                    onClick={showPhotoPage}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        showPhotoPage()
                      }
                    }}
                    style={{
                      position: 'relative',
                      aspectRatio: '1 / 1',
                      overflow: 'hidden',
                      border: '1px solid rgba(56, 189, 248, 0.34)',
                      borderRadius: '22px',
                      background: 'rgba(2, 6, 23, 0.62)',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    {photos[0] && (
                      <img
                        src={photos[0].previewUrl}
                        alt={slot.eventName}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          display: 'block',
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    )}

                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background:
                          'linear-gradient(180deg, rgba(2, 6, 23, 0.02) 30%, rgba(2, 6, 23, 0.82) 100%)',
                      }}
                    />

                    <div
                      style={{
                        position: 'absolute',
                        left: '14px',
                        right: '14px',
                        bottom: '14px',
                        color: '#ffffff',
                        fontSize: '1rem',
                        fontWeight: '950',
                        lineHeight: '1.12',
                        textAlign: 'left',
                        textShadow: '0 2px 14px rgba(0, 0, 0, 0.55)',
                        pointerEvents: 'none',
                      }}
                    >
                      {slot.eventName}
                    </div>
                  </article>
                )
              })}
            </div>

            <button className="primary-button" type="button" onClick={showVisitorDetailsPage}>
              Back to details
            </button>
          </section>
        )}

        {page === 'public-drop' && drop && buyer && (
          <section className="drop-preview">
            <p className="lead">{testBrandName} presents</p>

            <h1>
              <span>{drop.eventName}</span>
              <span className="no-wrap">
                Only available until {formatDisplayDate(drop.closeDate)}
              </span>
            </h1>

            <div className="rule-card">
              <span>{photos.length} photos</span>
              <span>{formatPrice(drop.singlePhotoPrice)} single photo</span>
              <span>{formatPrice(drop.fullEventPrice)} full event unlock</span>
              <span>Viewing as {buyer.name}</span>
            </div>

            <p className="support">
              Browse the event photos. Click any image to inspect it larger before buying.
            </p>

            {photos.length === 0 && (
              <p className="support">
                No photo previews are loaded. Go back to manage photos and reselect images
                for this local proof.
              </p>
            )}

            {photos.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: '14px',
                  width: 'min(100%, 760px)',
                  margin: '34px auto 0',
                  padding: '16px',
                  border: '1px solid rgba(56, 189, 248, 0.28)',
                  borderRadius: '22px',
                  background: 'rgba(56, 189, 248, 0.08)',
                }}
              >
                <div
                  style={{
                    color: '#e2e8f0',
                    fontSize: '1rem',
                    fontWeight: '850',
                    textAlign: 'left',
                  }}
                >
                  Want the whole event?
                </div>

                <button
                  type="button"
                  style={{
                    padding: '9px 14px',
                    border: '1px solid rgba(56, 189, 248, 0.5)',
                    borderRadius: '999px',
                    background: 'rgba(56, 189, 248, 0.16)',
                    color: '#e0f2fe',
                    fontSize: '0.86rem',
                    fontWeight: '950',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Unlock full event {formatPrice(drop.fullEventPrice)}
                </button>
              </div>
            )}

            {photos.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                  gap: '18px',
                  marginTop: '38px',
                }}
              >
                {photos.map((photo) => (
                  <article
                    key={photo.id}
                    style={{
                      overflow: 'hidden',
                      border: '1px solid rgba(248, 250, 252, 0.12)',
                      borderRadius: '22px',
                      background: 'rgba(248, 250, 252, 0.08)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => openInspectionPhoto(photo)}
                      style={{
                        display: 'grid',
                        placeItems: 'center',
                        width: '100%',
                        minHeight: '220px',
                        padding: 0,
                        border: 0,
                        background: 'rgba(2, 6, 23, 0.62)',
                        cursor: 'zoom-in',
                      }}
                    >
                      <img
                        src={photo.previewUrl}
                        alt={photo.name}
                        style={{
                          display: 'block',
                          width: '100%',
                          height: '220px',
                          objectFit: 'contain',
                        }}
                      />
                    </button>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '12px',
                      }}
                    >
                      <div
                        style={{
                          color: '#cbd5e1',
                          fontSize: '0.85rem',
                          fontWeight: '800',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          textAlign: 'left',
                        }}
                      >
                        {photo.name}
                      </div>

                      <button
                        type="button"
                        style={{
                          padding: '7px 11px',
                          border: '1px solid rgba(56, 189, 248, 0.42)',
                          borderRadius: '999px',
                          background: 'rgba(56, 189, 248, 0.12)',
                          color: '#e0f2fe',
                          fontSize: '0.8rem',
                          fontWeight: '900',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Buy {formatPrice(drop.singlePhotoPrice)}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <button className="primary-button" type="button" onClick={showEventWallPage}>
              Back to event wall
            </button>
          </section>
        )}

        {inspectionPhoto && drop && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Inspect photo"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 50,
              display: 'grid',
              placeItems: 'center',
              padding: '24px',
              background: 'rgba(2, 6, 23, 0.88)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <section
              style={{
                width: 'min(100%, 1180px)',
                maxHeight: '92vh',
                display: 'grid',
                gap: '16px',
                padding: '18px',
                border: '1px solid rgba(248, 250, 252, 0.16)',
                borderRadius: '28px',
                background: 'rgba(15, 23, 42, 0.96)',
                boxShadow: '0 28px 80px rgba(0, 0, 0, 0.52)',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: '14px',
                }}
              >
                <div
                  style={{
                    minWidth: 0,
                    color: '#e2e8f0',
                    fontSize: '1rem',
                    fontWeight: '900',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textAlign: 'left',
                  }}
                >
                  {inspectionPhoto.name}
                </div>

                <button
                  type="button"
                  onClick={closeInspectionPhoto}
                  style={{
                    padding: '9px 14px',
                    border: '1px solid rgba(248, 250, 252, 0.22)',
                    borderRadius: '999px',
                    background: 'rgba(248, 250, 252, 0.08)',
                    color: '#f8fafc',
                    fontSize: '0.86rem',
                    fontWeight: '950',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  minHeight: 'min(68vh, 720px)',
                  border: '1px solid rgba(248, 250, 252, 0.1)',
                  borderRadius: '22px',
                  background: 'rgba(2, 6, 23, 0.68)',
                  overflow: 'hidden',
                }}
              >
                <img
                  src={inspectionPhoto.previewUrl}
                  alt={inspectionPhoto.name}
                  style={{
                    display: 'block',
                    width: '100%',
                    maxHeight: '68vh',
                    objectFit: 'contain',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  alignItems: 'center',
                  gap: '14px',
                }}
              >
                <div
                  style={{
                    color: '#cbd5e1',
                    fontSize: '0.95rem',
                    fontWeight: '800',
                    textAlign: 'left',
                  }}
                >
                  Inspect before buying.
                </div>

                <button
                  type="button"
                  style={{
                    padding: '11px 16px',
                    border: '1px solid rgba(56, 189, 248, 0.52)',
                    borderRadius: '999px',
                    background: 'rgba(56, 189, 248, 0.16)',
                    color: '#e0f2fe',
                    fontSize: '0.9rem',
                    fontWeight: '950',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Buy {formatPrice(drop.singlePhotoPrice)}
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  )
}

export default App