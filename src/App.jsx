import { useState } from 'react'
import './App.css'

function App() {
  const [view, setView] = useState('studio')
  const [collectionName, setCollectionName] = useState('')
  const [photographerName, setPhotographerName] = useState('')
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
  }

  function handleCustomerEntry(event) {
    event.preventDefault()

    const formData = new FormData(event.currentTarget)

    setCustomer({
      name: formData.get('customerName'),
      phone: formData.get('customerPhone'),
      email: formData.get('customerEmail'),
    })

    setView('collection')
  }

  function resetConcept() {
    setView('studio')
    setCollectionName('')
    setPhotographerName('')
    setSingleImagePrice('7')
    setWatermarkText('FotoDeck')
    setPhotos([])
    setCustomer(null)
    setSelectedPhoto(null)
  }

  return (
    <main className="deck-page">
      <section className="deck-shell">
        <header className="deck-header">
          <button className="brand-button" type="button" onClick={() => setView('studio')}>
            FotoDeck
          </button>

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
        </header>

        {view === 'studio' && (
          <section className="studio-view">
            <div className="studio-intro">
              <p className="soft-label">Studio</p>

              <h1>Quiet photo collections.</h1>

              <p>
                Create a clean collection, add finished images, and let the photographs do the work.
              </p>
            </div>

            <section className="studio-panel">
              <div className="studio-fields">
                <label>
                  Collection name
                  <input
                    type="text"
                    value={collectionName}
                    placeholder="Autumn Wedding"
                    onChange={(event) => setCollectionName(event.target.value)}
                  />
                </label>

                <label>
                  Photographer
                  <input
                    type="text"
                    value={photographerName}
                    placeholder="Studio or photographer name"
                    onChange={(event) => setPhotographerName(event.target.value)}
                  />
                </label>

                <label>
                  Single image price
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

              <label className="photo-loader">
                <span>Add photos</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoSelection}
                />
              </label>
            </section>

            <section className="studio-preview">
              <div className="preview-heading">
                <div>
                  <p className="soft-label">Preview</p>
                  <h2>{collectionName || 'Untitled collection'}</h2>
                </div>

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
                  Add photographs to preview the collection.
                </div>
              )}

              {photos.length > 0 && (
                <div className="image-mosaic">
                  {photos.map((photo) => (
                    <article className="mosaic-card" key={photo.id}>
                      <img src={photo.previewUrl} alt={photo.name} />
                      <span>{watermarkText || 'FotoDeck'}</span>
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
                {photographerName || 'Photographer'}
              </p>

              <h1>{collectionName || 'Photo collection'}</h1>

              <p>
                Enter your details to view the photographs.
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

        {view === 'collection' && (
          <section className="collection-view">
            <div className="collection-heading">
              <div>
                <p className="soft-label">
                  {photographerName || 'Photographer'}
                </p>

                <h1>{collectionName || 'Photo collection'}</h1>

                {customer && (
                  <p className="customer-line">
                    Viewing as {customer.name}
                  </p>
                )}
              </div>

              <div className="price-mark">
                NZ${singleImagePrice || '0'} per image
              </div>
            </div>

            {photos.length === 0 && (
              <div className="empty-photo-space">
                No photographs have been added yet.
              </div>
            )}

            {photos.length > 0 && (
              <div className="customer-grid">
                {photos.map((photo) => (
                  <article className="customer-photo" key={photo.id}>
                    <button type="button" onClick={() => setSelectedPhoto(photo)}>
                      <img src={photo.previewUrl} alt={photo.name} />
                      <span>{watermarkText || 'FotoDeck'}</span>
                    </button>

                    <div className="buy-row">
                      <span>{photo.name}</span>
                      <button type="button">
                        Buy NZ${singleImagePrice || '0'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
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
                <img src={selectedPhoto.previewUrl} alt={selectedPhoto.name} />
                <span>{watermarkText || 'FotoDeck'}</span>
              </div>

              <div className="lightbox-bottom">
                <p>Single image purchase</p>

                <button type="button">
                  Buy NZ${singleImagePrice || '0'}
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
