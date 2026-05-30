import { useEffect, useRef, useState } from 'react'
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

function priceFromCents(priceCents) {
  const cents = Number(priceCents || 0)

  if (!Number.isFinite(cents) || cents <= 0) {
    return ''
  }

  return (cents / 100).toFixed(2).replace(/\.00$/, '')
}

function getInitialView() {
  const pathname = window.location.pathname

  if (pathname === '/admin') {
    return 'studio'
  }

  if (pathname === '/view') {
    const params = new URLSearchParams(window.location.search)
    const collectionId = params.get('collectionId')
    const eventId = params.get('eventId')

    if (collectionId && eventId) {
      return 'photo-grid'
    }

    return 'public-collections'
  }

  return 'landing'
}

function App() {
  const checkoutRef = useRef(null)
  const uploadCancelRef = useRef(false)
  const uploadControllersRef = useRef([])

  const [view, setView] = useState(getInitialView)
  const [collectionName, setCollectionName] = useState('FOTODECK')
  const [eventName, setEventName] = useState('Event')
  const [activeCollectionId, setActiveCollectionId] = useState('')
  const [activeEventId, setActiveEventId] = useState('')
  const [singlePhotoPrice, setSinglePhotoPrice] = useState('7')
  const [watermarkText, setWatermarkText] = useState('FOTODECK')
  const [photos, setPhotos] = useState([])
  const [visiblePhotoCount, setVisiblePhotoCount] = useState(24)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [loadStatus, setLoadStatus] = useState('No photos loaded yet')
  const [uploadStatus, setUploadStatus] = useState('No upload yet')
  const [uploadProgress, setUploadProgress] = useState(null)
  const [isUploading, setIsUploading] = useState(false)
  const [savedCollections, setSavedCollections] = useState([])
  const [savedEvents, setSavedEvents] = useState([])
  const [savedStatus, setSavedStatus] = useState('')
  const [eventCoverUrls, setEventCoverUrls] = useState({})
  const [deleteStatus, setDeleteStatus] = useState('No delete action yet')
  const [deletingPhotoId, setDeletingPhotoId] = useState('')
  const [deletingEventId, setDeletingEventId] = useState('')
  const [deletingCollectionId, setDeletingCollectionId] = useState('')
  const [cartItems, setCartItems] = useState([])
  const [buyerEmail, setBuyerEmail] = useState('')
  const [cartStatus, setCartStatus] = useState('Cart is empty')
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [priceStatus, setPriceStatus] = useState('No price edit yet')
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false)
  const [editingCollectionId, setEditingCollectionId] = useState('')
  const [collectionEditName, setCollectionEditName] = useState('')
  const [collectionEditPrice, setCollectionEditPrice] = useState('7')
  const [collectionEditWatermark, setCollectionEditWatermark] = useState('FOTODECK')
  const [collectionEditStatus, setCollectionEditStatus] = useState('No collection edit yet')
  const [isSavingCollectionEdit, setIsSavingCollectionEdit] = useState(false)
  const [purchasedSessionId, setPurchasedSessionId] = useState('')
  const [purchasedImages, setPurchasedImages] = useState([])
  const [purchasedStatus, setPurchasedStatus] = useState('')
  const [isLoadingPurchasedImages, setIsLoadingPurchasedImages] = useState(false)
  const [signupBusinessName, setSignupBusinessName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPhone, setSignupPhone] = useState('')
  const [signupStatus, setSignupStatus] = useState('')
  const [isStatsOpen, setIsStatsOpen] = useState(false)
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [statsStatus, setStatsStatus] = useState('Stats not loaded')
  const [statsData, setStatsData] = useState(null)

  useEffect(() => {
    async function loadPublicViewFromUrl() {
      const params = new URLSearchParams(window.location.search)
      const collectionId = params.get('collectionId')
      const eventId = params.get('eventId')
      const stripeStatus = params.get('stripe')
      const stripeSessionId = params.get('session_id')

      if (stripeStatus === 'success' && stripeSessionId) {
        setCartStatus('Payment successful. Download your purchased photos below.')
        setPurchasedSessionId(stripeSessionId)
        await handleLoadPurchasedImages(stripeSessionId)
      }

      if (stripeStatus === 'cancel') {
        setCartStatus('Payment cancelled. Your selected photos were not purchased.')
        setPurchasedStatus('')
        setPurchasedImages([])
        setPurchasedSessionId('')
      }

      if (!collectionId || !eventId) {
        setView('public-collections')
        await handleLoadSavedCollectionsEvents()
        return
      }

      setActiveCollectionId(collectionId)
      setActiveEventId(eventId)
      setView('photo-grid')
      await handleLoadPublicEvent(collectionId, eventId)
    }

    async function loadStudioViewFromUrl() {
      await handleLoadSavedCollectionsEvents()
    }

    async function loadReturningVisitorFromStorage() {
      if (window.location.pathname === '/view' || window.location.pathname === '/admin') {
        return
      }

      const savedVisitor = window.localStorage.getItem('fotodeck_visitor')

      if (!savedVisitor) {
        return
      }

      try {
        const visitor = JSON.parse(savedVisitor)

        if (!visitor || !visitor.email || !visitor.phone) {
          return
        }

        setSignupBusinessName(visitor.name || '')
        setSignupEmail(visitor.email || '')
        setSignupPhone(visitor.phone || '')
        setSignupStatus('Welcome back. Opening Events...')
        setView('public-collections')
        window.history.replaceState({}, document.title, '/view')
        await handleLoadSavedCollectionsEvents()
      } catch {
        window.localStorage.removeItem('fotodeck_visitor')
      }
    }

    if (window.location.pathname === '/view') {
      loadPublicViewFromUrl()
    }

    if (window.location.pathname === '/admin') {
      loadStudioViewFromUrl()
    }

    loadReturningVisitorFromStorage()
  }, [])

  function clearVisiblePhotosForNewTarget() {
    setPhotos([])
    setVisiblePhotoCount(24)
    setSelectedPhoto(null)
    setLoadStatus('No photos loaded yet')
    setDeleteStatus('No delete action yet')
    setCartItems([])
    setBuyerEmail('')
    setCartStatus('Cart is empty')
    setIsCheckingOut(false)
    setPriceStatus('No price edit yet')
    setPurchasedSessionId('')
    setPurchasedImages([])
    setPurchasedStatus('')
    setIsLoadingPurchasedImages(false)
  }

  function clearCollectionEditState() {
    setEditingCollectionId('')
    setCollectionEditName('')
    setCollectionEditPrice('7')
    setCollectionEditWatermark('FOTODECK')
    setCollectionEditStatus('No collection edit yet')
    setIsSavingCollectionEdit(false)
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

  function getPublicViewUrl() {
    const collectionId = getCurrentCollectionId()
    const eventId = getCurrentEventId()

    return `/view?collectionId=${encodeURIComponent(collectionId)}&eventId=${encodeURIComponent(eventId)}`
  }

  function getPhotoPrice(photo) {
    if (photo.priceCents && Number(photo.priceCents) > 0) {
      return Number(photo.priceCents) / 100
    }

    const parsedPrice = Number(singlePhotoPrice)

    if (Number.isNaN(parsedPrice)) {
      return 0
    }

    return parsedPrice
  }

  function getCartTotal() {
    return cartItems.reduce((total, photo) => total + getPhotoPrice(photo), 0)
  }

  function isPhotoInCart(photo) {
    return cartItems.some((item) => item.id === photo.id)
  }

  function handleAddToCart(photo) {
    if (isPhotoInCart(photo)) {
      setCartStatus(`${photo.name} is already selected`)
      return
    }

    setCartItems((currentItems) => [...currentItems, photo])
    setCartStatus(`Selected ${photo.name}`)
  }

  function handleLightboxCartAction(photo) {
    if (!isPhotoInCart(photo)) {
      handleAddToCart(photo)
    }

    setSelectedPhoto(null)
    setView('photo-grid')
  }

  function getSelectedPhotoIndex() {
    if (!selectedPhoto) {
      return -1
    }

    return photos.findIndex((photo) => photo.id === selectedPhoto.id)
  }

  function handlePreviousSelectedPhoto() {
    const selectedIndex = getSelectedPhotoIndex()

    if (selectedIndex <= 0) {
      return
    }

    setSelectedPhoto(photos[selectedIndex - 1])
  }

  function handleNextSelectedPhoto() {
    const selectedIndex = getSelectedPhotoIndex()

    if (selectedIndex < 0 || selectedIndex >= photos.length - 1) {
      return
    }

    setSelectedPhoto(photos[selectedIndex + 1])
  }

  function handleRemoveFromCart(photo) {
    setCartItems((currentItems) => currentItems.filter((item) => item.id !== photo.id))
    setCartStatus(`Removed ${photo.name}`)
  }

  function handleClearCart() {
    setCartItems([])
    setCartStatus('Cart cleared')
  }

  function handleLoadMorePhotos() {
    setVisiblePhotoCount((currentCount) => currentCount + 24)
  }

  function handleScrollToCheckout() {
    setCartStatus(
      cartItems.length === 0
        ? 'Select photos first, then checkout.'
        : 'Check your selected photos and enter email below.'
    )

    window.setTimeout(() => {
      if (checkoutRef.current) {
        checkoutRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      }
    }, 50)
  }

  async function handleBackToEvents() {
    setSelectedPhoto(null)
    setView('public-collections')
    window.history.pushState({}, document.title, '/view')

    if (savedCollections.length === 0 || savedEvents.length === 0) {
      await handleLoadSavedCollectionsEvents()
    }
  }

  async function handleLandingSignup(event) {
    event.preventDefault()

    const visitorName = signupBusinessName.trim()
    const email = signupEmail.trim()
    const phone = signupPhone.trim()

    if (!visitorName) {
      setSignupStatus('Enter name')
      return
    }

    if (!email || !email.includes('@')) {
      setSignupStatus('Enter email')
      return
    }

    if (!phone) {
      setSignupStatus('Enter phone')
      return
    }

    const signup = {
      name: visitorName,
      email,
      phone,
      createdAt: new Date().toISOString(),
    }

    window.localStorage.setItem('fotodeck_visitor', JSON.stringify(signup))
    setSignupStatus('Opening Events...')
    setView('public-collections')
    window.history.pushState({}, document.title, '/view')
    await handleLoadSavedCollectionsEvents()
  }

  function handleSecretAdminOpen() {
    const answer = window.prompt('Security word')

    if (answer && answer.trim().toLowerCase() === 'funga safari') {
      window.location.href = '/admin'
    }
  }

  async function handleLoadPurchasedImages(sessionIdOverride) {
    const sessionId = sessionIdOverride || purchasedSessionId

    if (!sessionId) {
      setPurchasedStatus('No paid Stripe session found')
      return
    }

    setIsLoadingPurchasedImages(true)
    setPurchasedStatus('Payment successful. Preparing your downloads...')

    try {
      const response = await fetch(`/api/purchased-images?sessionId=${encodeURIComponent(sessionId)}`)
      const result = await response.json()

      if (!response.ok || !result.ok) {
        setPurchasedImages([])
        setPurchasedStatus(result.error || 'Purchased downloads could not be loaded')
        setIsLoadingPurchasedImages(false)
        return
      }

      const images = result.images || []

      setPurchasedImages(images)
      setPurchasedStatus(
        images.length === 0
          ? 'Payment successful, but no purchased images were returned yet'
          : `Payment successful. ${images.length} purchased photo${images.length === 1 ? '' : 's'} ready to download below.`
      )
      setCartItems([])
      setCartStatus('Payment successful. Download your purchased photos below.')
      setIsLoadingPurchasedImages(false)
    } catch (error) {
      setPurchasedImages([])
      setPurchasedStatus(error.message || 'Purchased downloads could not be loaded')
      setIsLoadingPurchasedImages(false)
    }
  }

  async function handleCartCheckout() {
    if (cartItems.length === 0) {
      setCartStatus('Add at least one photo before checkout')
      return
    }

    if (!buyerEmail || !buyerEmail.includes('@')) {
      setCartStatus('Enter buyer email before checkout')
      return
    }

    setIsCheckingOut(true)
    setCartStatus('Opening secure card checkout...')

    try {
      const response = await fetch('/api/stripe-create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collectionId: getCurrentCollectionId(),
          eventId: getCurrentEventId(),
          buyerEmail,
          imageIds: cartItems.map((item) => item.id),
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.ok || !result.checkoutUrl) {
        setCartStatus(result.error || 'Card checkout could not be opened')
        setIsCheckingOut(false)
        return
      }

      window.location.href = result.checkoutUrl
    } catch (error) {
      setCartStatus(error.message || 'Card checkout could not be opened')
      setIsCheckingOut(false)
    }
  }

  async function handleEditCollection(collection) {
    const collectionEvents = savedEvents.filter((event) => event.collection_id === collection.id)
    const firstEvent = collectionEvents[0] || null

    setEditingCollectionId(collection.id)
    setCollectionEditName(collection.name || 'FOTODECK')
    setCollectionEditPrice(singlePhotoPrice || '7')
    setCollectionEditWatermark(watermarkText || 'FOTODECK')
    setCollectionEditStatus(`Editing ${collection.name || 'Collection'}`)
    setIsSavingCollectionEdit(false)

    setActiveCollectionId(collection.id)
    setActiveEventId(firstEvent?.id || '')
    setCollectionName(collection.name || 'FOTODECK')
    setEventName(firstEvent?.name || 'Event')
    setPhotos([])
    setVisiblePhotoCount(24)
    setSelectedPhoto(null)
    setCartItems([])
    setBuyerEmail('')
    setCartStatus('Cart is empty')
    setPriceStatus(`Editing ${collection.name || 'Collection'} collection settings`)

    if (!firstEvent) {
      setLoadStatus('Selected collection has no saved events yet')
      return
    }

    setLoadStatus(`Loading saved photos for ${firstEvent.name || 'selected event'}...`)

    try {
      const response = await fetch(
        `/api/images?collectionId=${encodeURIComponent(collection.id)}&eventId=${encodeURIComponent(firstEvent.id)}`
      )
      const result = await response.json()

      if (!response.ok || !result.ok || !result.images || result.images.length === 0) {
        setPhotos([])
        setVisiblePhotoCount(24)
        setLoadStatus(result.error || 'No saved photos found for this collection')
        return
      }

      const savedPhotos = sortPhotosFirstFirst(result.images.map(mapSavedPhotoToPhoto))
      const firstPhoto = result.images[0] || {}
      const savedPrice = priceFromCents(firstPhoto.price_cents)
      const savedWatermark = firstPhoto.watermark_text || watermarkText || 'FOTODECK'

      setPhotos(savedPhotos)
      setVisiblePhotoCount(24)

      if (savedPrice) {
        setSinglePhotoPrice(savedPrice)
        setCollectionEditPrice(savedPrice)
      }

      setWatermarkText(savedWatermark)
      setCollectionEditWatermark(savedWatermark)
      setLoadStatus(`Loaded ${savedPhotos.length} saved photo${savedPhotos.length === 1 ? '' : 's'} for collection editing`)
    } catch (error) {
      setLoadStatus(error.message || 'Saved photos could not be loaded')
    }
  }

  function handleCancelCollectionEdit() {
    clearCollectionEditState()
    setPriceStatus('Collection edit cancelled')
  }

  async function handleSaveCollectionEdit() {
    const collectionId = editingCollectionId
    const nextName = collectionEditName.trim()
    const price = Number(collectionEditPrice)
    const nextWatermark = collectionEditWatermark.trim() || 'FOTODECK'

    if (!collectionId) {
      setCollectionEditStatus('Choose a collection before saving')
      return
    }

    if (!nextName) {
      setCollectionEditStatus('Enter collection name')
      return
    }

    if (!Number.isFinite(price) || price < 0) {
      setCollectionEditStatus('Enter a valid photo price')
      return
    }

    setIsSavingCollectionEdit(true)
    setCollectionEditStatus(`Saving ${nextName}...`)

    try {
      const response = await fetch('/api/update-collection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collectionId,
          collectionName: nextName,
          price,
          watermarkText: nextWatermark,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.ok) {
        setCollectionEditStatus(result.error || 'Collection could not be saved')
        setIsSavingCollectionEdit(false)
        return
      }

      const updatedPriceCents = Math.round(price * 100)

      setCollectionName(nextName)
      setSinglePhotoPrice(String(price))
      setWatermarkText(nextWatermark)
      setPhotos((currentPhotos) =>
        currentPhotos.map((photo) => ({
          ...photo,
          collectionName: nextName,
          priceCents: updatedPriceCents,
          watermarkText: nextWatermark,
        }))
      )
      setCartItems([])
      setCartStatus('Cart cleared after collection change')
      setPriceStatus(`Saved ${nextName} collection settings`)
      setCollectionEditStatus(`Saved ${nextName}`)
      setIsSavingCollectionEdit(false)

      await handleLoadSavedCollectionsEvents()

      if (activeCollectionId === collectionId && activeEventId) {
        await handleLoadSavedPhotos(collectionId, activeEventId)
      }
    } catch (error) {
      setCollectionEditStatus(error.message || 'Collection could not be saved')
      setIsSavingCollectionEdit(false)
    }
  }

  async function handleUpdateSelectedEventPrice() {
    const collectionId = getCurrentCollectionId()
    const eventId = getCurrentEventId()
    const price = Number(singlePhotoPrice)

    if (!activeCollectionId || !activeEventId) {
      setPriceStatus('Select a saved event before editing price')
      return
    }

    if (!Number.isFinite(price) || price < 0) {
      setPriceStatus('Enter a valid photo price')
      return
    }

    setIsUpdatingPrice(true)
    setPriceStatus(`Saving price NZ$${price.toFixed(2)}...`)

    try {
      const response = await fetch('/api/update-event-price', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collectionId,
          eventId,
          price,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.ok) {
        setPriceStatus(result.error || 'Price could not be updated')
        setIsUpdatingPrice(false)
        return
      }

      const updatedPriceCents = result.updated?.price_cents || Math.round(price * 100)

      setPhotos((currentPhotos) =>
        currentPhotos.map((photo) => ({
          ...photo,
          priceCents: updatedPriceCents,
        }))
      )

      setCartItems([])
      setCartStatus('Cart cleared after price change')
      setPriceStatus(`Saved ${eventName || 'Event'} price at NZ$${price.toFixed(2)}`)
      setIsUpdatingPrice(false)

      await handleLoadSavedPhotos(collectionId, eventId)
    } catch (error) {
      setPriceStatus(error.message || 'Price could not be updated')
      setIsUpdatingPrice(false)
    }
  }

  function handleCancelUpload() {
    uploadCancelRef.current = true
    uploadControllersRef.current.forEach((controller) => {
      controller.abort()
    })
    uploadControllersRef.current = []
    setUploadStatus('Cancelling upload...')
  }

  function makeDisplayFileName(fileName) {
    const cleanName = String(fileName || 'fotodeck-display.jpg')
      .trim()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase()

    return `${cleanName || 'fotodeck-display'}-display.jpg`
  }

  async function makeDisplayImageFile(file) {
    const maxEdge = 1800
    const jpegQuality = 0.78

    if (!file || !file.type || !file.type.startsWith('image/')) {
      return file
    }

    try {
      const imageBitmap = await createImageBitmap(file)
      const longestEdge = Math.max(imageBitmap.width, imageBitmap.height)
      const scale = longestEdge > maxEdge ? maxEdge / longestEdge : 1
      const nextWidth = Math.max(1, Math.round(imageBitmap.width * scale))
      const nextHeight = Math.max(1, Math.round(imageBitmap.height * scale))
      const canvas = document.createElement('canvas')

      canvas.width = nextWidth
      canvas.height = nextHeight

      const context = canvas.getContext('2d')

      if (!context) {
        imageBitmap.close()
        return file
      }

      context.drawImage(imageBitmap, 0, 0, nextWidth, nextHeight)
      imageBitmap.close()

      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', jpegQuality)
      })

      if (!blob) {
        return file
      }

      return new File([blob], makeDisplayFileName(file.name), {
        type: 'image/jpeg',
        lastModified: file.lastModified || Date.now(),
      })
    } catch {
      return file
    }
  }

  async function handlePhotoSelection(event) {
    const files = Array.from(event.target.files || [])

    if (files.length === 0) {
      return
    }

    const collectionId = getCurrentCollectionId()
    const eventId = getCurrentEventId()
    const uploadBatchSize = 3
    const uploadTimeoutMs = 180000
    const uploadedPhotos = []
    const failedUploads = []

    uploadCancelRef.current = false
    uploadControllersRef.current = []
    setPhotos([])
    setVisiblePhotoCount(24)
    setSelectedPhoto(null)
    setCartItems([])
    setBuyerEmail('')
    setCartStatus('Cart is empty')
    setIsUploading(true)
    setUploadProgress({
      total: files.length,
      completed: 0,
      failed: 0,
      currentFile: files[0]?.name || '',
    })
    setUploadStatus(`Preparing ${files.length} photo${files.length === 1 ? '' : 's'} for upload...`)

    async function uploadSinglePhoto(file, index) {
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => {
        controller.abort()
      }, uploadTimeoutMs)

      uploadControllersRef.current = [...uploadControllersRef.current, controller]

      try {
        const displayFile = await makeDisplayImageFile(file)
        const formData = new FormData()

        formData.append('displayFile', displayFile)
        formData.append('deliveryFile', file)
        formData.append('collectionId', collectionId)
        formData.append('collectionName', collectionName || 'FOTODECK')
        formData.append('eventId', eventId)
        formData.append('eventName', eventName || 'Event')
        formData.append('watermarkText', watermarkText || 'FOTODECK')
        formData.append('price', singlePhotoPrice || '0')

        const response = await fetch('/api/upload-display', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        })

        const result = await response.json()

        if (!response.ok || !result.ok || !result.image) {
          return {
            ok: false,
            fileName: file.name || `Photo ${index + 1}`,
            error: result.error || `Upload failed on ${file.name || `photo ${index + 1}`}`,
          }
        }

        return {
          ok: true,
          photo: mapSavedPhotoToPhoto(result.image),
          fileName: file.name || `Photo ${index + 1}`,
          displaySize: displayFile.size || 0,
          deliverySize: file.size || 0,
        }
      } catch (error) {
        return {
          ok: false,
          fileName: file.name || `Photo ${index + 1}`,
          error:
            error.name === 'AbortError'
              ? `Upload cancelled or timed out for ${file.name || `photo ${index + 1}`}`
              : error.message || `Upload failed on ${file.name || `photo ${index + 1}`}`,
        }
      } finally {
        window.clearTimeout(timeoutId)
        uploadControllersRef.current = uploadControllersRef.current.filter((item) => item !== controller)
      }
    }

    for (let index = 0; index < files.length; index += uploadBatchSize) {
      if (uploadCancelRef.current) {
        break
      }

      const batchFiles = files.slice(index, index + uploadBatchSize)
      const firstBatchNumber = index + 1
      const lastBatchNumber = index + batchFiles.length

      setUploadProgress({
        total: files.length,
        completed: uploadedPhotos.length,
        failed: failedUploads.length,
        currentFile: `${firstBatchNumber}-${lastBatchNumber} of ${files.length}`,
      })
      setUploadStatus(`Compressing display files and uploading ${firstBatchNumber}-${lastBatchNumber} of ${files.length}...`)

      const batchResults = await Promise.all(
        batchFiles.map((file, batchIndex) => uploadSinglePhoto(file, index + batchIndex))
      )

      batchResults.forEach((result) => {
        if (result.ok) {
          uploadedPhotos.push(result.photo)
        } else if (!uploadCancelRef.current) {
          failedUploads.push(result)
        }
      })

      const sortedUploadedPhotos = sortPhotosFirstFirst(uploadedPhotos)
      const nextStart = lastBatchNumber + 1
      const nextEnd = Math.min(lastBatchNumber + uploadBatchSize, files.length)

      setPhotos(sortedUploadedPhotos)
      setVisiblePhotoCount(24)
      setUploadProgress({
        total: files.length,
        completed: uploadedPhotos.length,
        failed: failedUploads.length,
        currentFile: nextStart <= files.length ? `${nextStart}-${nextEnd} of ${files.length}` : '',
      })
      setUploadStatus(
        failedUploads.length === 0
          ? `Uploaded ${uploadedPhotos.length} of ${files.length}`
          : `Uploaded ${uploadedPhotos.length} of ${files.length}. ${failedUploads.length} failed.`
      )
    }

    const sortedUploadedPhotos = sortPhotosFirstFirst(uploadedPhotos)

    setPhotos(sortedUploadedPhotos)
    setVisiblePhotoCount(24)
    setIsUploading(false)
    setUploadProgress({
      total: files.length,
      completed: sortedUploadedPhotos.length,
      failed: failedUploads.length,
      currentFile: '',
    })

    if (uploadCancelRef.current) {
      setUploadStatus(
        failedUploads.length === 0
          ? `Upload cancelled. ${sortedUploadedPhotos.length} photo${sortedUploadedPhotos.length === 1 ? '' : 's'} uploaded before cancel.`
          : `Upload cancelled. ${sortedUploadedPhotos.length} uploaded, ${failedUploads.length} failed.`
      )
    } else if (failedUploads.length > 0) {
      const failedNames = failedUploads.map((item) => item.fileName).join(', ')

      setUploadStatus(
        `Uploaded ${sortedUploadedPhotos.length} of ${files.length}. Failed: ${failedNames}`
      )
    } else {
      setUploadStatus(`Uploaded ${sortedUploadedPhotos.length} photo${sortedUploadedPhotos.length === 1 ? '' : 's'}`)
    }

    setLoadStatus(`${sortedUploadedPhotos.length} photo${sortedUploadedPhotos.length === 1 ? '' : 's'} shown for this event`)
    uploadControllersRef.current = []
    uploadCancelRef.current = false
    event.target.value = ''
  }

  async function handleLoadPublicEvent(collectionId, eventId) {
    setLoadStatus('Loading photos...')

    try {
      const response = await fetch(
        `/api/images?collectionId=${encodeURIComponent(collectionId)}&eventId=${encodeURIComponent(eventId)}`
      )
      const result = await response.json()

      if (!response.ok || !result.ok || !result.images || result.images.length === 0) {
        setPhotos([])
        setVisiblePhotoCount(24)
        setCartItems([])
        setCartStatus('Cart is empty')
        setLoadStatus(result.error || 'No photos found')
        return
      }

      const savedPhotos = sortPhotosFirstFirst(result.images.map(mapSavedPhotoToPhoto))
      const firstPhoto = savedPhotos[0]
      const savedPrice = priceFromCents(firstPhoto?.priceCents)

      setPhotos(savedPhotos)
      setVisiblePhotoCount(24)
      setCollectionName(firstPhoto?.collectionName || 'Collection')
      setEventName(firstPhoto?.eventName || 'Event')
      setActiveCollectionId(collectionId)
      setActiveEventId(eventId)

      if (savedPrice) {
        setSinglePhotoPrice(savedPrice)
      }

      setCartItems([])
      setBuyerEmail('')
      setCartStatus('Cart is empty')
      setLoadStatus(`Loaded ${savedPhotos.length} photo${savedPhotos.length === 1 ? '' : 's'}`)
    } catch (error) {
      setLoadStatus(error.message || 'Photos could not be loaded')
    }
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
        setVisiblePhotoCount(24)
        setCartItems([])
        setCartStatus('Cart is empty')
        setLoadStatus(result.error || 'No saved photos found for this event')
        return
      }

      const savedPhotos = sortPhotosFirstFirst(result.images.map(mapSavedPhotoToPhoto))
      const savedPrice = priceFromCents(savedPhotos[0]?.priceCents)

      setPhotos(savedPhotos)
      setVisiblePhotoCount(24)

      if (savedPrice) {
        setSinglePhotoPrice(savedPrice)
      }

      setCartItems([])
      setCartStatus('Cart is empty')
      setLoadStatus(`Loaded ${savedPhotos.length} saved photo${savedPhotos.length === 1 ? '' : 's'} for this event`)
    } catch (error) {
      setLoadStatus(error.message || 'Saved photos could not be loaded')
    }
  }

  async function loadEventCoverPhotos(collectionsToUse, eventsToUse) {
    const nextCoverUrls = {}

    for (const event of eventsToUse) {
      try {
        const collection = collectionsToUse.find((item) => item.id === event.collection_id)

        if (!collection) {
          continue
        }

        const response = await fetch(
          `/api/images?collectionId=${encodeURIComponent(collection.id)}&eventId=${encodeURIComponent(event.id)}`
        )
        const result = await response.json()

        if (!response.ok || !result.ok || !result.images || result.images.length === 0) {
          continue
        }

        const sortedImages = sortPhotosFirstFirst(result.images)
        const firstImage = sortedImages[0]

        if (firstImage?.display_key) {
          nextCoverUrls[event.id] = makeDisplayPhotoUrl(firstImage.display_key)
          setEventCoverUrls({ ...nextCoverUrls })
        }
      } catch {
        nextCoverUrls[event.id] = ''
      }
    }
  }

  async function handleLoadSavedCollectionsEvents() {
    setSavedStatus('Loading collections...')

    try {
      const response = await fetch('/api/collections-events')
      const result = await response.json()

      if (!response.ok || !result.ok) {
        setSavedCollections([])
        setSavedEvents([])
        setEventCoverUrls({})
        setSavedStatus(result.error || 'Collections could not be loaded')
        return
      }

      const nextCollections = result.collections || []
      const nextEvents = result.events || []

      setSavedCollections(nextCollections)
      setSavedEvents(nextEvents)
      setSavedStatus('')
      setEventCoverUrls({})

      loadEventCoverPhotos(nextCollections, nextEvents)
    } catch (error) {
      setSavedCollections([])
      setSavedEvents([])
      setEventCoverUrls({})
      setSavedStatus(error.message || 'Collections could not be loaded')
    }
  }

  async function handleSelectSavedEvent(collection, event) {
    setActiveCollectionId(collection.id)
    setActiveEventId(event.id)
    setCollectionName(collection.name || 'FOTODECK')
    setEventName(event.name || 'Event')
    setPhotos([])
    setVisiblePhotoCount(24)
    setSelectedPhoto(null)
    setCartItems([])
    setBuyerEmail('')
    setCartStatus('Cart is empty')
    setPriceStatus(`Selected ${event.name || 'Event'}`)
    setSavedStatus(`Selected ${collection.name || 'Collection'} / ${event.name || 'Event'}`)
    await handleLoadSavedPhotos(collection.id, event.id)
  }

  async function handleOpenPublicEvent(collection, event) {
    setActiveCollectionId(collection.id)
    setActiveEventId(event.id)
    setCollectionName(collection.name || 'FOTODECK')
    setEventName(event.name || 'Event')
    setPhotos([])
    setVisiblePhotoCount(24)
    setSelectedPhoto(null)
    setCartItems([])
    setBuyerEmail('')
    setCartStatus('Cart is empty')
    setView('photo-grid')

    window.history.pushState(
      {},
      document.title,
      `/view?collectionId=${encodeURIComponent(collection.id)}&eventId=${encodeURIComponent(event.id)}`
    )

    await handleLoadPublicEvent(collection.id, event.id)
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
      setCartItems((currentItems) => currentItems.filter((item) => item.id !== photo.id))

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
        setVisiblePhotoCount(24)
        setSelectedPhoto(null)
        setCartItems([])
        setBuyerEmail('')
        setCartStatus('Cart is empty')
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

  async function handleDeleteCollection(collection) {
    const firstConfirm = window.confirm(
      `Delete this entire collection from FOTODECK?\n\nCollection: ${collection.name || 'Collection'}\nPhotos: ${collection.photo_count || 0}\n\nThis deletes the collection, all events inside it, all photos inside those events, and the saved display files.`
    )

    if (!firstConfirm) {
      return
    }

    const typedConfirm = window.prompt(
      `Final confirmation for deleting collection:\n\n${collection.name || 'Collection'}\n\nType DELETE COLLECTION to continue.`
    )

    if (typedConfirm !== 'DELETE COLLECTION') {
      setDeleteStatus('Collection delete cancelled')
      return
    }

    setDeletingCollectionId(collection.id)
    setDeleteStatus(`Deleting collection ${collection.name || 'Collection'}...`)

    try {
      const response = await fetch('/api/delete-collection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          collectionId: collection.id,
          confirmText: 'DELETE COLLECTION',
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.ok) {
        setDeleteStatus(result.error || `Could not delete collection ${collection.name || 'Collection'}`)
        setDeletingCollectionId('')
        return
      }

      setSavedCollections((currentCollections) => currentCollections.filter((item) => item.id !== collection.id))
      setSavedEvents((currentEvents) => currentEvents.filter((item) => item.collection_id !== collection.id))

      if (activeCollectionId === collection.id) {
        setActiveCollectionId('')
        setActiveEventId('')
        setCollectionName('FOTODECK')
        setEventName('Event')
        setPhotos([])
        setVisiblePhotoCount(24)
        setSelectedPhoto(null)
        setCartItems([])
        setBuyerEmail('')
        setCartStatus('Cart is empty')
        setLoadStatus('Deleted collection removed from current view')
      }

      if (editingCollectionId === collection.id) {
        clearCollectionEditState()
      }

      setDeleteStatus(`Deleted collection ${collection.name || 'Collection'}`)
      setSavedStatus(`Deleted collection ${collection.name || 'Collection'}`)
      setDeletingCollectionId('')
    } catch (error) {
      setDeleteStatus(error.message || `Could not delete collection ${collection.name || 'Collection'}`)
      setDeletingCollectionId('')
    }
  }

  function handleDeleteEventButtonClick(clickEvent, collection, event) {
    clickEvent.preventDefault()
    clickEvent.stopPropagation()
    handleDeleteEvent(collection, event)
  }

  function handleOpenCustomerView() {
    window.location.href = '/view'
  }


  async function handleOpenStats() {
    setIsStatsOpen(true)
    setIsLoadingStats(true)
    setStatsStatus('Loading stats...')

    try {
      const response = await fetch('/api/admin-stats')
      const result = await response.json()

      if (!response.ok || !result.ok) {
        setStatsData(null)
        setStatsStatus(result.error || 'Stats could not be loaded')
        setIsLoadingStats(false)
        return
      }

      setStatsData(result)
      setStatsStatus('Stats loaded')
      setIsLoadingStats(false)
    } catch (error) {
      setStatsData(null)
      setStatsStatus(error.message || 'Stats could not be loaded')
      setIsLoadingStats(false)
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
    setVisiblePhotoCount(24)
    setSelectedPhoto(null)
    setLoadStatus('No photos loaded yet')
    setUploadStatus('No upload yet')
    setUploadProgress(null)
    setDeleteStatus('No delete action yet')
    setDeletingPhotoId('')
    setDeletingEventId('')
    setDeletingCollectionId('')
    setCartItems([])
    setBuyerEmail('')
    setCartStatus('Cart is empty')
    setIsCheckingOut(false)
    setPriceStatus('No price edit yet')
    setIsUpdatingPrice(false)
    setPurchasedSessionId('')
    setPurchasedImages([])
    setPurchasedStatus('')
    setIsLoadingPurchasedImages(false)
    clearCollectionEditState()
  }

  function handleAdminReturn() {
    const answer = window.prompt('Security word')

    if (answer && answer.trim().toLowerCase() === 'funga safari') {
      setSelectedPhoto(null)
      window.location.href = '/admin'
    }
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

  function renderPublicCollections() {
    const visibleCollections = savedCollections.filter((collection) =>
      savedEvents.some((event) => event.collection_id === collection.id)
    )

    return (
      <section
        style={{
          width: '100vw',
          maxWidth: '100vw',
          marginLeft: 'calc(50% - 50vw)',
          marginRight: 'calc(50% - 50vw)',
          padding: '30px 18px 70px',
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          onClick={handleAdminReturn}
          aria-label="Admin return"
          title=""
          style={{
            position: 'fixed',
            top: '18px',
            right: '18px',
            width: '9px',
            height: '9px',
            padding: 0,
            border: 0,
            borderRadius: '999px',
            background: 'rgba(34, 34, 34, 0.22)',
            cursor: 'pointer',
            zIndex: 10,
          }}
        />

        <div
          style={{
            width: '100%',
            display: 'grid',
            justifyItems: 'center',
            alignItems: 'center',
            gap: '8px',
            textAlign: 'center',
            margin: '0 auto 30px',
          }}
        >
          <h1
            style={{
              width: '100%',
              margin: 0,
              fontSize: '3rem',
              lineHeight: 1,
              letterSpacing: '-0.08em',
              color: '#111827',
              textAlign: 'center',
            }}
          >
            FOTODECK
          </h1>

          <p
            style={{
              width: '100%',
              margin: 0,
              fontSize: '1.25rem',
              color: '#374151',
              textAlign: 'center',
            }}
          >
            Choose your Event
          </p>
        </div>

        <div
          style={{
            width: '100%',
            maxWidth: '1120px',
            margin: '0 auto',
          }}
        >
          {savedStatus && (
            <div
              style={{
                padding: '14px 18px',
                borderRadius: '18px',
                background: '#ffffff',
                color: '#374151',
                marginBottom: '18px',
                boxShadow: '0 10px 24px rgba(17, 24, 39, 0.08)',
                textAlign: 'center',
              }}
            >
              {savedStatus}
            </div>
          )}

          {!savedStatus && visibleCollections.length === 0 && (
            <div
              style={{
                padding: '24px',
                borderRadius: '24px',
                background: '#ffffff',
                color: '#374151',
                boxShadow: '0 10px 24px rgba(17, 24, 39, 0.08)',
                textAlign: 'center',
              }}
            >
              No photo events are available yet.
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gap: '30px',
            }}
          >
            {visibleCollections.map((collection) => {
              const collectionEvents = savedEvents.filter((event) => event.collection_id === collection.id)

              return (
                <section
                  key={collection.id}
                  style={{
                    display: 'grid',
                    gap: '14px',
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize: '1.15rem',
                      color: '#111827',
                      letterSpacing: '-0.03em',
                      textAlign: 'center',
                    }}
                  >
                    {collection.name}
                  </h2>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
                      gap: '12px',
                    }}
                  >
                    {collectionEvents.map((event) => {
                      const coverUrl = eventCoverUrls[event.id] || ''

                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => handleOpenPublicEvent(collection, event)}
                          style={{
                            aspectRatio: '1 / 1',
                            minHeight: 0,
                            position: 'relative',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'flex-end',
                            alignItems: 'flex-start',
                            gap: '8px',
                            textAlign: 'left',
                            padding: '12px',
                            border: '1px solid rgba(17, 24, 39, 0.08)',
                            borderRadius: '20px',
                            background: coverUrl
                              ? `linear-gradient(180deg, rgba(17,24,39,0.02), rgba(17,24,39,0.78)), url("${coverUrl}") center/cover`
                              : 'linear-gradient(135deg, #ffffff, #d1d5db)',
                            color: '#ffffff',
                            boxShadow: '0 10px 24px rgba(17, 24, 39, 0.12)',
                            cursor: 'pointer',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '0.98rem',
                              lineHeight: 1.02,
                              fontWeight: 900,
                              letterSpacing: '-0.04em',
                              textShadow: coverUrl ? '0 2px 10px rgba(0,0,0,0.5)' : 'none',
                              color: coverUrl ? '#ffffff' : '#111827',
                            }}
                          >
                            {event.name}
                          </span>

                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '6px 9px',
                              borderRadius: '999px',
                              background: coverUrl ? '#ffffff' : '#111827',
                              color: coverUrl ? '#111827' : '#ffffff',
                              fontSize: '0.76rem',
                              fontWeight: 900,
                            }}
                          >
                            {event.photo_count} photo{event.photo_count === 1 ? '' : 's'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      </section>
    )
  }

  const cartTotal = getCartTotal()
  const isStudioView = view === 'studio'
  const showTopHeader = isStudioView
  const smallHeadingStyle = {
    fontSize: '0.8rem',
    lineHeight: '1.1',
    letterSpacing: '0.02em',
  }
  const visiblePhotos = photos.slice(0, visiblePhotoCount)
  const hiddenPhotoCount = Math.max(0, photos.length - visiblePhotos.length)

  return (
    <main className="deck-page">
      <section className="deck-shell">
        {showTopHeader && (
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
                <button type="button" onClick={handleOpenCustomerView}>
                  Open customer view
                </button>
                <button type="button" onClick={handleOpenStats} disabled={isLoadingStats}>
                  {isLoadingStats ? 'Loading stats...' : 'Stats'}
                </button>
                <button type="button" onClick={() => handleLoadSavedPhotos()}>
                  Load current event
                </button>
                <button type="button" onClick={handleReset}>
                  Reset
                </button>
              </nav>
            )}
          </header>
        )}

        {view === 'landing' && (
          <section
            style={{
              minHeight: '100vh',
              display: 'grid',
              placeItems: 'center',
              padding: '28px 20px',
              background:
                'linear-gradient(90deg, rgba(5,10,20,0.58), rgba(5,10,20,0.18), rgba(5,10,20,0.02)), url("/fotodeck-landing.jpg") center/cover no-repeat',
            }}
          >
            <button
              type="button"
              onClick={handleSecretAdminOpen}
              aria-label="Admin access"
              title=""
              style={{
                position: 'fixed',
                top: '18px',
                right: '18px',
                width: '9px',
                height: '9px',
                padding: 0,
                border: 0,
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.42)',
                cursor: 'pointer',
                zIndex: 10,
              }}
            />

            <section
              style={{
                width: '100%',
                maxWidth: '520px',
                justifySelf: 'start',
                marginLeft: 'min(6vw, 72px)',
                display: 'grid',
                gap: '22px',
                textAlign: 'left',
                padding: '30px',
                borderRadius: '34px',
                background: 'rgba(255, 255, 255, 0.58)',
                boxShadow: '0 28px 80px rgba(0, 0, 0, 0.24)',
                backdropFilter: 'blur(7px)',
              }}
            >
              <div>
                <h1
                  style={{
                    margin: 0,
                    fontSize: '3.4rem',
                    lineHeight: 0.95,
                    letterSpacing: '-0.08em',
                    color: '#07111f',
                  }}
                >
                  FOTODECK
                </h1>
                <p
                  style={{
                    margin: '12px 0 0',
                    fontSize: '1.15rem',
                    color: '#111827',
                    fontWeight: 800,
                  }}
                >
                  Enter your details to view photos.
                </p>
              </div>

              <form onSubmit={handleLandingSignup}>
                <div
                  style={{
                    display: 'grid',
                    gap: '12px',
                  }}
                >
                  <label style={{ display: 'grid', gap: '7px', textAlign: 'left', fontWeight: 800, color: '#111827' }}>
                    Name
                    <input
                      type="text"
                      value={signupBusinessName}
                      placeholder="Name"
                      onChange={(event) => setSignupBusinessName(event.target.value)}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: '7px', textAlign: 'left', fontWeight: 800, color: '#111827' }}>
                    Email
                    <input
                      type="email"
                      value={signupEmail}
                      placeholder="Email"
                      onChange={(event) => setSignupEmail(event.target.value)}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: '7px', textAlign: 'left', fontWeight: 800, color: '#111827' }}>
                    Phone
                    <input
                      type="tel"
                      value={signupPhone}
                      placeholder="Phone"
                      onChange={(event) => setSignupPhone(event.target.value)}
                    />
                  </label>
                </div>

                <div style={{ marginTop: '20px' }}>
                  <button className="dark-action" type="submit">
                    Start FOTODECK
                  </button>
                </div>
              </form>

              {signupStatus && (
                <strong style={{ color: '#111827' }}>
                  {signupStatus}
                </strong>
              )}
            </section>
          </section>
        )}

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
                    disabled={isUploading || isUpdatingPrice}
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

                {isUploading && (
                  <button className="photo-loader-button" type="button" onClick={handleCancelUpload}>
                    Cancel upload
                  </button>
                )}
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
                  Load Collections
                </button>
              </div>

              {(savedStatus || savedCollections.length === 0) && (
                <div className="empty-photo-space">
                  <strong>{savedStatus || 'No saved collections yet'}</strong>
                </div>
              )}

              {editingCollectionId && (
                <section className="studio-panel">
                  <div className="preview-heading">
                    <div>
                      <p className="soft-label">
                        Collection edit
                      </p>
                      <h1 style={smallHeadingStyle}>{collectionEditName || 'Collection'}</h1>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button type="button" onClick={handleCancelCollectionEdit} disabled={isSavingCollectionEdit}>
                        Cancel
                      </button>

                      <button
                        className="dark-action"
                        type="button"
                        onClick={handleSaveCollectionEdit}
                        disabled={isUploading || isSavingCollectionEdit}
                      >
                        {isSavingCollectionEdit ? 'Saving...' : 'Save collection changes'}
                      </button>
                    </div>
                  </div>

                  <div className="studio-fields">
                    <label>
                      Collection name
                      <input
                        type="text"
                        value={collectionEditName}
                        placeholder="FOTODECK"
                        onChange={(event) => setCollectionEditName(event.target.value)}
                        disabled={isUploading || isSavingCollectionEdit}
                      />
                    </label>

                    <label>
                      Collection photo price
                      <input
                        type="number"
                        min="0"
                        value={collectionEditPrice}
                        onChange={(event) => setCollectionEditPrice(event.target.value)}
                        disabled={isUploading || isSavingCollectionEdit}
                      />
                    </label>

                    <label>
                      Collection fotomark
                      <input
                        type="text"
                        value={collectionEditWatermark}
                        placeholder="FOTODECK"
                        onChange={(event) => setCollectionEditWatermark(event.target.value)}
                        disabled={isUploading || isSavingCollectionEdit}
                      />
                    </label>
                  </div>

                  <div className="empty-photo-space">
                    <strong>{collectionEditStatus}</strong>
                    <br />
                    <span>Collection id stays unchanged: {editingCollectionId}</span>
                  </div>
                </section>
              )}

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

                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <div className="price-mark">
                              {collection.photo_count} photo{collection.photo_count === 1 ? '' : 's'}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleEditCollection(collection)}
                              disabled={isUploading || isSavingCollectionEdit || deletingCollectionId === collection.id}
                            >
                              {editingCollectionId === collection.id ? 'Editing' : 'Edit Collection'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteCollection(collection)}
                              disabled={isUploading || isSavingCollectionEdit || deletingCollectionId === collection.id}
                            >
                              {deletingCollectionId === collection.id ? 'Deleting...' : 'Delete Collection'}
                            </button>
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
                                <button type="button" onClick={() => handleSelectSavedEvent(collection, event)} disabled={isUploading || deletingEventId === event.id || deletingCollectionId === collection.id}>
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
                                    onClick={(clickEvent) => handleDeleteEventButtonClick(clickEvent, collection, event)}
                                    disabled={isUploading || deletingEventId === event.id || deletingCollectionId === collection.id}
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
                  onClick={handleOpenCustomerView}
                  disabled={isUploading}
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
                    {uploadProgress.failed > 0 && (
                      <>
                        <br />
                        <span>{uploadProgress.failed} failed</span>
                      </>
                    )}
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
                        <img
                          src={photo.previewUrl}
                          alt={photo.name}
                          loading="lazy"
                          decoding="async"
                        />
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

        {view === 'public-collections' && renderPublicCollections()}

        {view === 'photo-grid' && (
          <section className="collection-view">
            <button
              type="button"
              onClick={handleAdminReturn}
              aria-label="Admin return"
              title=""
              style={{
                position: 'fixed',
                top: '18px',
                right: '18px',
                width: '9px',
                height: '9px',
                padding: 0,
                border: 0,
                borderRadius: '999px',
                background: 'rgba(34, 34, 34, 0.22)',
                cursor: 'pointer',
                zIndex: 10,
              }}
            />

            <div className="collection-heading">
              <div>
                <p className="soft-label">
                  {collectionName || 'Collection'} / {eventName || 'Event'}
                </p>
              </div>

              <div className="price-mark">
                {cartItems.length} selected / NZ${cartTotal.toFixed(2)}
              </div>
            </div>

            {purchasedSessionId && (
              <section className="studio-preview" style={{ marginBottom: '18px' }}>
                <div className="preview-heading" style={{ marginBottom: 0 }}>
                  <div>
                    <p className="soft-label">
                      Payment successful
                    </p>
                    <h1 style={smallHeadingStyle}>
                      {purchasedImages.length === 0
                        ? 'Preparing your purchased photos'
                        : 'Your purchased photos are ready'}
                    </h1>
                  </div>

                  <button
                    className="dark-action"
                    type="button"
                    onClick={() => handleLoadPurchasedImages(purchasedSessionId)}
                    disabled={isLoadingPurchasedImages}
                  >
                    {isLoadingPurchasedImages ? 'Checking...' : 'Refresh downloads'}
                  </button>
                </div>

                <div className="empty-photo-space" style={{ marginTop: '12px' }}>
                  <strong>{purchasedStatus || 'Payment successful. Checking your purchased photos...'}</strong>
                  <br />
                  <span>Download your photos below.</span>

                  {purchasedImages.length > 0 && (
                    <div style={{ width: '100%', display: 'grid', gap: '10px', marginTop: '14px' }}>
                      {purchasedImages.map((image) => (
                        <div
                          key={image.image_id}
                          className="buy-row"
                          style={{
                            width: '100%',
                            borderRadius: '999px',
                          }}
                        >
                          <span>{image.file_name}</span>
                          <a
                            className="dark-action"
                            href={image.download_url}
                            style={{
                              textDecoration: 'none',
                              padding: '8px 12px',
                              fontSize: '0.8rem',
                            }}
                          >
                            Download
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="studio-preview" style={{ marginBottom: '18px' }}>
              <div className="preview-heading" style={{ marginBottom: 0 }}>
                <div>
                  <p className="soft-label">
                    Cart
                  </p>
                  <h1 style={smallHeadingStyle}>
                    {cartItems.length === 0
                      ? 'Select photos to begin'
                      : `${cartItems.length} photo${cartItems.length === 1 ? '' : 's'} selected / NZ$${cartTotal.toFixed(2)}`}
                  </h1>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: '14px',
                    justifyItems: 'center',
                    width: '100%',
                  }}
                >
                  <button className="dark-action" type="button" onClick={handleScrollToCheckout} disabled={isCheckingOut}>
                    Checkout
                  </button>

                  <button
                    type="button"
                    onClick={handleBackToEvents}
                    style={{
                      borderRadius: '999px',
                      padding: '10px 16px',
                    }}
                  >
                    Back to Events
                  </button>
                </div>
              </div>
            </section>

            {photos.length === 0 && (
              <div className="empty-photo-space">
                {loadStatus}
              </div>
            )}

            {photos.length > 0 && (
              <>
                <div className="customer-grid">
                  {photos.map((photo) => {
                    const inCart = isPhotoInCart(photo)

                    return (
                      <article className="customer-photo" key={photo.id}>
                        <button type="button" onClick={() => setSelectedPhoto(photo)}>
                          <img
                            src={photo.previewUrl}
                            alt={photo.name}
                            loading="lazy"
                            decoding="async"
                          />
                          {renderWatermark(watermarkText)}
                        </button>

                        <div className="buy-row">
                          <span>{photo.name}</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (!inCart) {
                                handleAddToCart(photo)
                              }
                            }}
                            disabled={inCart}
                          >
                            {inCart ? 'Selected' : `Add NZ$${getPhotoPrice(photo).toFixed(2)}`}
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </>
            )}

            <section ref={checkoutRef} className="studio-preview" style={{ marginTop: '18px', scrollMarginTop: '20px' }}>
              <div className="preview-heading">
                <div>
                  <p className="soft-label">
                    Checkout
                  </p>
                  <h1 style={smallHeadingStyle}>
                    {cartItems.length} photo{cartItems.length === 1 ? '' : 's'} / NZ${cartTotal.toFixed(2)}
                  </h1>
                </div>

                <button className="dark-action" type="button" onClick={handleCartCheckout} disabled={isCheckingOut}>
                  {isCheckingOut ? 'Opening Checkout...' : 'Pay by Card'}
                </button>
              </div>

               <div
                className="empty-photo-space"
                style={{
                  marginTop: '12px',
                  marginBottom: '12px',
                  border: '2px solid #dc2626',
                  background: '#fff1f2',
                  color: '#991b1b',
                  textAlign: 'left',
                }}
              >
                <strong style={{ color: '#dc2626', fontSize: '1rem' }}>YOUR IMAGES WILL BE DOWNLOADED TO YOUR EMAIL</strong>
                <br />
                <br />
                <span style={{ color: '#991b1b' }}>
                  After payment, FOTODECK will email your download link to the email address entered below.
                </span>
                <br />
                <span style={{ color: '#991b1b' }}>
                  Open that email and tap the download link to get your purchased images.
                </span>
                <br />
                <span style={{ color: '#991b1b' }}>
                  Check your inbox after payment. If it is not there, check junk or spam.
                </span>
                <br />
                <br />
                <strong style={{ color: '#991b1b' }}>Want more than one photo?</strong>
                <br />
                <span style={{ color: '#991b1b' }}>Keep browsing and tap Add on any photo you want. Pay once when you are ready.</span>
              </div>

              <div className="studio-fields">
                <label>
                  Email for delivery
                  <input
                    type="email"
                    value={buyerEmail}
                    placeholder="buyer@example.com"
                    onChange={(event) => setBuyerEmail(event.target.value)}
                    disabled={isCheckingOut}
                  />
                </label>
              </div>

              <div className="empty-photo-space" style={{ marginTop: '12px' }}>
                <strong>{cartStatus}</strong>

                {cartItems.length > 0 && (
                  <div style={{ width: '100%', display: 'grid', gap: '8px', marginTop: '12px' }}>
                    {cartItems.map((item) => (
                      <div
                        key={item.id}
                        className="buy-row"
                        style={{
                          width: '100%',
                          borderRadius: '999px',
                        }}
                      >
                        <span>{item.name}</span>
                        <button type="button" onClick={() => handleRemoveFromCart(item)} disabled={isCheckingOut}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {cartItems.length > 0 && (
                  <>
                    <br />
                    <button type="button" onClick={handleClearCart} disabled={isCheckingOut}>
                      Clear cart
                    </button>
                  </>
                )}
              </div>
            </section>

            {cartItems.length > 0 && (
              <div
                style={{
                  position: 'fixed',
                  left: '50%',
                  bottom: '14px',
                  transform: 'translateX(-50%)',
                  width: 'calc(100% - 28px)',
                  maxWidth: '520px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: '999px',
                  background: 'rgba(255, 255, 255, 0.94)',
                  boxShadow: '0 18px 44px rgba(17, 24, 39, 0.22)',
                  zIndex: 30,
                }}
              >
                <strong
                  style={{
                    fontSize: '0.9rem',
                    color: '#111827',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cartItems.length} selected / NZ${cartTotal.toFixed(2)}
                </strong>

                <button className="dark-action" type="button" onClick={handleScrollToCheckout} disabled={isCheckingOut}>
                  Checkout
                </button>
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
                <div className="lightbox-photo-frame">
                  <img
                    src={selectedPhoto.previewUrl}
                    alt={selectedPhoto.name}
                    loading="eager"
                    decoding="async"
                  />
                  {renderWatermark(watermarkText)}
                </div>
              </div>

              <div className="lightbox-bottom">
                <button type="button" onClick={handlePreviousSelectedPhoto} disabled={getSelectedPhotoIndex() <= 0}>
                  Previous
                </button>

                <p>
                  NZ${getPhotoPrice(selectedPhoto).toFixed(2)}
                </p>

                <button type="button" onClick={handleNextSelectedPhoto} disabled={getSelectedPhotoIndex() < 0 || getSelectedPhotoIndex() >= photos.length - 1}>
                  Next
                </button>

                <button type="button" onClick={() => handleLightboxCartAction(selectedPhoto)}>
                  {isPhotoInCart(selectedPhoto) ? 'Back to photos' : 'Add to cart'}
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
