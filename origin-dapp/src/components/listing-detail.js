import React, { Component, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { connect } from 'react-redux'
import {
  FormattedMessage,
  // FormattedNumber,
  defineMessages,
  injectIntl
} from 'react-intl'

import { showAlert } from 'actions/Alert'
import {
  handleNotificationsSubscription,
  storeWeb3Intent
} from 'actions/App'
import {
  update as updateTransaction,
  upsert as upsertTransaction
} from 'actions/Transaction'

import { PendingBadge, SoldBadge, FeaturedBadge } from 'components/badges'
import Modal from 'components/modal'
import Reviews from 'components/reviews'
import UserCard from 'components/user-card'
import Calendar from './calendar'
import { ProcessingModal, ProviderModal } from 'components/modals/wait-modals'

import getCurrentProvider from 'utils/getCurrentProvider'
import { getListing } from 'utils/listing'
import { offerStatusToListingAvailability } from 'utils/offer'
import { prepareSlotsToSave } from 'utils/calendarHelpers'

import origin from '../services/origin'

/* linking to contract Etherscan requires knowledge of which network we're on */
const etherscanDomains = {
  1: 'etherscan.io',
  3: 'ropsten.etherscan.io',
  4: 'rinkeby.etherscan.io',
  42: 'kovan.etherscan.io'
}

class ListingsDetail extends Component {
  constructor(props) {
    super(props)

    this.STEP = {
      VIEW: 1,
      ONBOARDING: 2,
      METAMASK: 3,
      PROCESSING: 4,
      PURCHASED: 5,
      ERROR: 6
    }

    this.state = {
      etherscanDomain: null,
      display: 'normal',
      loading: true,
      offers: [],
      pictures: [],
      purchases: [],
      step: this.STEP.VIEW,
      boostLevel: null,
      boostValue: 0,
      onboardingCompleted: false,
      slotsToReserve: [],
      featuredImageIdx: 0
    }

    this.intlMessages = defineMessages({
      loadingError: {
        id: 'listing-detail.loadingError',
        defaultMessage: 'There was an error loading this listing.'
      }
    })

    this.handleBuyClicked = this.handleBuyClicked.bind(this)
    this.loadListing = this.loadListing.bind(this)
    this.handleMakeOffer = this.handleMakeOffer.bind(this)
    this.handleSkipOnboarding = this.handleSkipOnboarding.bind(this)
    this.setFeaturedImage = this.setFeaturedImage.bind(this)
  }

  async handleBuyClicked() {
    this.props.storeWeb3Intent('buy this listing')
  }

  async componentWillMount() {
    if (this.props.listingId) {
      // Load from IPFS
      const listing = await this.loadListing()
      const offers = await this.loadOffers()
      console.log('listing:', listing)
      this.setState({
        unitsRemaining: await origin.marketplace.unitsAvailable(listing, offers)
      })

    } else if (this.props.listingJson) {
      const obj = Object.assign({}, this.props.listingJson, { loading: false })
      // Listing json passed in directly
      this.setState(obj)
    }
    const networkId = await web3.eth.net.getId()
    this.setState({
      etherscanDomain: etherscanDomains[networkId]
    })
  }

  componentDidUpdate(prevProps) {
    // on account found
    if (this.props.web3Account && !prevProps.web3Account) {
      this.loadBuyerPurchases()
    }
  }

  async handleMakeOffer(skip, slotsToReserve, quantity) {
    quantity = 2 // TODO: remove when done testing

    // onboard if no identity, purchases, and not already completed
    const shouldOnboard =
      !this.props.profile.strength &&
      !this.state.purchases.length &&
      !this.state.onboardingCompleted

    this.props.storeWeb3Intent('offer to buy this listing')

    if (web3.givenProvider && this.props.web3Account) {
      if (!skip && shouldOnboard) {
        return this.setState({
          onboardingCompleted: true,
          step: this.STEP.ONBOARDING,
          slotsToReserve
        })
      }

      this.setState({ step: this.STEP.METAMASK })

      const isFractional = this.state.listingType === 'fractional'
      const slots = slotsToReserve || this.state.slotsToReserve
      const price =
        isFractional ?
          slots.reduce((totalPrice, nextPrice) => totalPrice + nextPrice.price, 0).toString() :
          (this.state.price * quantity).toString()

      try {
        const offerData = {
          listingId: this.props.listingId,
          listingType: this.state.listingType,
          totalPrice: {
            amount: price,
            currency: 'ETH'
          },
          commission: {
            amount: this.state.boostValue.toString(),
            currency: 'OGN'
          },
          // Set the finalization time to ~1 year after the offer is accepted.
          // This is the window during which the buyer may file a dispute.
          finalizes: 365 * 24 * 60 * 60,
          unitsPurchased: quantity
        }

        if (isFractional) {
          offerData.slots = prepareSlotsToSave(slots)
        }

        const transactionReceipt = await origin.marketplace.makeOffer(
          this.props.listingId,
          offerData,
          (confirmationCount, transactionReceipt) => {
            this.props.updateTransaction(confirmationCount, transactionReceipt)
          }
        )
        this.props.upsertTransaction({
          ...transactionReceipt,
          transactionTypeKey: 'makeOffer'
        })
        this.setState({ step: this.STEP.PURCHASED })
        this.props.handleNotificationsSubscription('buyer', this.props)
      } catch (error) {
        console.error(error)
        this.setState({ step: this.STEP.ERROR })
      }
    }
  }

  handleSkipOnboarding(e) {
    e.preventDefault()

    this.handleMakeOffer(true)
  }

  async loadBuyerPurchases() {
    try {
      const { web3Account } = this.props
      const listingIds = await origin.marketplace.getListings({
        idsOnly: true,
        purchasesFor: web3Account
      })
      const listingPromises = listingIds.map(listingId => {
        return new Promise(async resolve => {
          const listing = await getListing(listingId, true)
          resolve({ listingId, listing })
        })
      })
      const withListings = await Promise.all(listingPromises)
      const offerPromises = await withListings.map(obj => {
        return new Promise(async resolve => {
          const offers = await origin.marketplace.getOffers(obj.listingId, {
            for: web3Account
          })
          resolve(Object.assign(obj, { offers }))
        })
      })
      const withOffers = await Promise.all(offerPromises)
      const offersByListing = withOffers.map(obj => {
        return obj.offers.map(offer => Object.assign({}, obj, { offer }))
      })
      const offersFlattened = [].concat(...offersByListing)

      this.setState({ purchases: offersFlattened })
    } catch (error) {
      console.error(error)
    }
  }

  async loadListing() {
    try {
      const listing = await getListing(this.props.listingId, true)
      this.setState({
        ...listing,
        loading: false
      })
      return listing
    } catch (error) {
      this.props.showAlert(
        this.props.intl.formatMessage(this.intlMessages.loadingError)
      )
      console.error(
        `Error fetching contract or IPFS info for listing: ${
          this.props.listingId
        }`
      )
      console.error(error)
    }
  }

  async loadOffers() {
    try {
      const offers = await origin.marketplace.getOffers(this.props.listingId)
      this.setState({ offers })
      return offers
    } catch (error) {
      console.error(
        `Error fetching offers for listing: ${this.props.listingId}`
      )
      console.error(error)
    }
  }

  resetToStepOne() {
    this.setState({ step: this.STEP.VIEW })
  }

  setFeaturedImage(idx) {
    this.setState({
      featuredImageIdx: idx
    })
  }

  render() {
    const { web3Account } = this.props
    const {
      // boostLevel,
      // boostValue,
      category,
      description,
      display,
      loading,
      name,
      offers,
      pictures,
      price,
      seller,
      status,
      step,
      schemaType,
      featuredImageIdx,
      unitsRemaining
    } = this.state
    const currentOffer = offers.find(o => {
      const availability = offerStatusToListingAvailability(o.status)

      return ['pending', 'sold'].includes(availability)
    })
    const currentOfferAvailability =
      currentOffer && offerStatusToListingAvailability(currentOffer.status)
    const isWithdrawn = status === 'inactive'
    const isPending = currentOfferAvailability === 'pending'
    const isSold = currentOfferAvailability === 'sold'
    const isAvailable = !isPending && !isSold && !isWithdrawn
    const showPendingBadge = isPending && !isWithdrawn
    const showSoldBadge = isSold || isWithdrawn
    /* When ENABLE_PERFORMANCE_MODE env var is set to false even the search result page won't
     * show listings with the Featured badge, because listings are loaded from web3. We could
     * pass along featured information from elasticsearch, but that would increase the code
     * complexity.
     *
     * Deployed versions of the DApp will always have ENABLE_PERFORMANCE_MODE set to
     * true, and show "featured" badge.
     */
    const showFeaturedBadge = display === 'featured' && isAvailable
    const userIsBuyer = currentOffer && web3Account === currentOffer.buyer
    const userIsSeller = web3Account === seller

    return (
      <div className="listing-detail">
        {step === this.STEP.ONBOARDING && (
          <Modal backdrop="static" isOpen={true}>
            <div className="image-container">
              <img src="images/identity.svg" role="presentation" />
            </div>
            <p>
              <FormattedMessage
                id={'listing-detail.firstPurchaseHeading'}
                defaultMessage={`You're about to make your first purchase on Origin.`}
              />
            </p>
            <div className="disclaimer">
              <p>
                <FormattedMessage
                  id={'listing-detail.identityDisclaimer'}
                  defaultMessage={
                    'We recommend verifying your identity first. Sellers are more likely to accept your purchase offer if they know a little bit about you.'
                  }
                />
              </p>
            </div>
            <div className="button-container">
              <Link
                to="/profile"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-clear"
                onClick={() => this.setState({ step: this.STEP.VIEW })}
                ga-category="buyer_onboarding_modal"
                ga-label="verify_identity"
              >
                <FormattedMessage
                  id={'listing-detail.verifyIdentity'}
                  defaultMessage={'Verify Identity'}
                />
              </Link>
            </div>
            <a
              href="#"
              className="skip-identity"
              onClick={this.handleSkipOnboarding}
              ga-category="buyer_onboarding_modal"
              ga-label="skip"
            >
              Skip
            </a>
          </Modal>
        )}
        {step === this.STEP.METAMASK && (
          <ProviderModal
            message={
              <FormattedMessage
                id={'listing-detail.providerInstruction'}
                defaultMessage={
                  'To make an offer on this listing, please confirm the transaction in {provider}.'
                }
                values={{
                  provider: getCurrentProvider(
                    origin &&
                      origin.contractService &&
                      origin.contractService.web3
                  )
                }}
              />
            }
          />
        )}
        {step === this.STEP.PROCESSING && <ProcessingModal />}
        {step === this.STEP.PURCHASED && (
          <Modal backdrop="static" isOpen={true}>
            <div className="image-container">
              <img src="images/circular-check-button.svg" role="presentation" />
            </div>
            <FormattedMessage
              id={'listing-detail.purchaseSuccessful'}
              defaultMessage={'Success!'}
            />
            <div className="disclaimer">
              <FormattedMessage
                id={'listing-detail.successDisclaimer'}
                defaultMessage={
                  "You have made an offer on this listing. Your offer will be visible within a few seconds. Your ETH payment has been transferred to an escrow contract. Here's what happens next:"
                }
              />
              <ul>
                <li>
                  <FormattedMessage
                    id={'listing-detail.successItem1'}
                    defaultMessage={
                      'The seller can choose to accept or reject your offer.'
                    }
                  />
                </li>
                <li>
                  <FormattedMessage
                    id={'listing-detail.successItem2'}
                    defaultMessage={
                      'If the offer is accepted and fulfilled, you will be able to confirm that the sale is complete. Your escrowed payment will be sent to the seller.'
                    }
                  />
                </li>
                <li>
                  <FormattedMessage
                    id={'listing-detail.successItem3'}
                    defaultMessage={
                      'If the offer is rejected, the escrowed payment will be immediately returned to your wallet.'
                    }
                  />
                </li>
              </ul>
            </div>
            <div className="button-container">
              <Link
                to="/my-purchases"
                className="btn btn-clear"
                ga-category="listing"
                ga-label="purchase_confirmation_modal_view_my_purchases"
              >
                <FormattedMessage
                  id={'listing-detail.viewPurchases'}
                  defaultMessage={'View Purchases'}
                />
              </Link>
            </div>
          </Modal>
        )}
        {step === this.STEP.ERROR && (
          <Modal backdrop="static" isOpen={true}>
            <div className="image-container">
              <img src="images/flat_cross_icon.svg" role="presentation" />
            </div>
            <FormattedMessage
              id={'listing-detail.errorPurchasingListing'}
              defaultMessage={'There was a problem purchasing this listing.'}
            />
            <br />
            <FormattedMessage
              id={'listing-detail.seeConsoleForDetails'}
              defaultMessage={'See the console for more details.'}
            />
            <div className="button-container">
              <a
                className="btn btn-clear"
                onClick={e => {
                  e.preventDefault()
                  this.resetToStepOne()
                }}
              >
                <FormattedMessage
                  id={'listing-detail.OK'}
                  defaultMessage={'OK'}
                />
              </a>
            </div>
          </Modal>
        )}
        <div
          className={`container listing-container${loading ? ' loading' : ''}`}
        >
          <div className="row">
            <div className="col-12">
              <div className="category placehold d-flex">
                <div>{category}</div>
                {!loading && (
                  <div className="badges">
                    {showPendingBadge && <PendingBadge />}
                    {showSoldBadge && <SoldBadge />}
                    {showFeaturedBadge && <FeaturedBadge />}
                    {/*boostValue > 0 && (
                      <span className={`boosted badge boost-${boostLevel}`}>
                        <img
                          src="images/boost-icon-arrow.svg"
                          role="presentation"
                        />
                      </span>
                    )*/}
                  </div>
                )}
              </div>
              <h1 className="title placehold">{name}</h1>
            </div>
            <div className="col-12 col-md-8 detail-info-box">
              {(loading || (pictures && !!pictures.length)) && (
                <div className="image-wrapper">
                  <img
                    className="featured-image"
                    src={pictures[featuredImageIdx]}
                  />
                  {pictures.length > 1 &&
                    <div className="photo-row">
                      {pictures.map((pictureUrl, idx) => (
                        <img
                          onClick={() => this.setFeaturedImage(idx)}
                          src={pictureUrl}
                          key={idx}
                          role="presentation"
                          className={featuredImageIdx === idx ? 'featured-thumb' : ''}
                        />
                      ))}
                    </div>
                  }
                </div>
              )}
              <p className="ws-aware description placehold">{description}</p>
              {/* Via Stan 5/25/2018: Hide until contracts allow for unitsRemaining > 1 */}
              {/*!!unitsRemaining && unitsRemaining < 5 &&
                <div className="units-remaining text-danger">
                  <FormattedMessage
                    id={ 'listing-detail.unitsRemaining' }
                    defaultMessage={ 'Just {unitsRemaining} left!' }
                    values={{ unitsRemaining: <FormattedNumber value={ unitsRemaining } /> }}
                  />
                </div>
              */}
            </div>
            <div className="col-12 col-md-4">
              {isAvailable &&
                !!price &&
                !!parseFloat(price) && (
                <div className="buy-box placehold">
                  <div className="price text-nowrap">
                    <img src="images/eth-icon.svg" role="presentation" />
                    {Number(price).toLocaleString(undefined, {
                      maximumFractionDigits: 5,
                      minimumFractionDigits: 5
                    })}
                      &nbsp;ETH
                  </div>
                  {/* Via Matt 4/5/2018: Hold off on allowing buyers to select quantity > 1 */}
                  {/*
                    <div className="quantity d-flex justify-content-between">
                      <div>Quantity</div>
                      <div className="text-right">
                        {Number(1).toLocaleString()}
                      </div>
                    </div>
                    <div className="total-price d-flex justify-content-between">
                      <div>Total Price</div>
                      <div className="price text-right">
                        {Number(price).toLocaleString(undefined, {minimumFractionDigits: 5, maximumFractionDigits: 5})} ETH
                      </div>
                    </div>
                  */}
                  <p>Quantity: {unitsRemaining}</p> {/* DEBUG ONLY */}
                  {!loading && (
                    <div className="btn-container">
                      {!userIsSeller && (
                        <button
                          className="btn btn-primary"
                          onClick={() => this.handleMakeOffer()}
                          onMouseDown={e => e.preventDefault()}
                          ga-category="listing"
                          ga-label="purchase"
                        >
                          <FormattedMessage
                            id={'listing-detail.purchase'}
                            defaultMessage={'Purchase'}
                          />
                        </button>
                      )}
                      {userIsSeller && (
                        <Link
                          to="/my-listings"
                          className="btn"
                          ga-category="listing"
                          ga-label="sellers_own_listing_my_listings_cta"
                        >
                            My Listings
                        </Link>
                      )}
                    </div>
                  )}
                  {/* Via Matt 9/4/2018: Not necessary until we have staking */}
                  {/*
                    <div className="boost-level">
                      <hr/>
                      <div className="row">
                        <div className="col-sm-6">
                          <p>Boost Level</p>
                          <Link to="/" target="_blank" rel="noopener noreferrer">What is this?</Link>
                        </div>
                        <div className="col-sm-6 text-right">
                          <p>{ boostLevel }</p>
                          <p>
                            <img src="images/ogn-icon.svg" role="presentation" />
                            <span className="font-bold">{ boostValue }</span>&nbsp;
                            <span className="font-blue font-bold">OGN</span>
                            <span className="help-block">1.00 USD</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  */}
                </div>
              )}
              {!isAvailable && (
                <div className="buy-box placehold unavailable text-center">
                  {!loading && (
                    <div className="reason">
                      {!isWithdrawn &&
                        isPending && (
                        <FormattedMessage
                          id={'listing-detail.reasonPending'}
                          defaultMessage={'This listing is {pending}'}
                          values={{
                            pending: <strong>Pending</strong>
                          }}
                        />
                      )}
                      {isSold && (
                        <FormattedMessage
                          id={'listing-detail.reasonSold'}
                          defaultMessage={'This listing is {sold}'}
                          values={{
                            sold: <strong>Sold</strong>
                          }}
                        />
                      )}
                    </div>
                  )}
                  {!loading &&
                    !userIsBuyer &&
                    !userIsSeller && (
                    <Fragment>
                      <div className="suggestion">
                        {!isWithdrawn &&
                            isPending && (
                          <FormattedMessage
                            id={'listing-detail.suggestionPublicPending'}
                            defaultMessage={
                              'Another buyer has already made an offer on this listing. Try visiting the listings page and searching for something similar.'
                            }
                          />
                        )}
                        {isSold && (
                          <FormattedMessage
                            id={'listing-detail.suggestionPublicSold'}
                            defaultMessage={
                              'Another buyer has already purchased this listing. Try visiting the listings page and searching for something similar.'
                            }
                          />
                        )}
                        {/* consider the possibility of a withdrawn listing despite a valid offer */}
                        {!isSold &&
                            isWithdrawn && (
                          <FormattedMessage
                            id={'listing-detail.suggestionPublicWithdrawn'}
                            defaultMessage={
                              'This listing is no longer available. Try visiting the listings page and searching for something similar.'
                            }
                          />
                        )}
                      </div>
                      <Link
                        to="/"
                        ga-category="listing"
                        ga-label="view_listings"
                      >
                        <FormattedMessage
                          id={'listing-detail.viewListings'}
                          defaultMessage={'View Listings'}
                        />
                      </Link>
                    </Fragment>
                  )}
                  {!loading &&
                    userIsBuyer && (
                    <div className="suggestion">
                      {isPending &&
                          currentOffer.status === 'created' && (
                        <FormattedMessage
                          id={'listing-detail.suggestionBuyerCreated'}
                          defaultMessage={`You've made an offer on this listing. Please wait for the seller to accept or reject your offer.`}
                        />
                      )}
                      {isPending &&
                          currentOffer.status === 'accepted' && (
                        <FormattedMessage
                          id={'listing-detail.suggestionBuyerAccepted'}
                          defaultMessage={`You've made an offer on this listing. View the offer to complete the sale.`}
                        />
                      )}
                      {isPending &&
                          currentOffer.status === 'disputed' && (
                        <FormattedMessage
                          id={'listing-detail.suggestionBuyerDisputed'}
                          defaultMessage={`You've made an offer on this listing. View the offer to check the status.`}
                        />
                      )}
                      {isSold && (
                        <FormattedMessage
                          id={'listing-detail.buyerPurchased'}
                          defaultMessage={`You've purchased this listing.`}
                        />
                      )}
                    </div>
                  )}
                  {!loading &&
                    userIsSeller && (
                    <div className="suggestion">
                      {isPending &&
                          currentOffer.status === 'created' && (
                        <FormattedMessage
                          id={'listing-detail.suggestionSellerCreated'}
                          defaultMessage={`A buyer is waiting for you to accept or reject their offer.`}
                        />
                      )}
                      {isPending &&
                          currentOffer.status === 'accepted' && (
                        <FormattedMessage
                          id={'listing-detail.suggestionSellerAccepted'}
                          defaultMessage={`You've accepted an offer for this listing. Please wait for the buyer to complete the sale.`}
                        />
                      )}
                      {isPending &&
                          currentOffer.status === 'disputed' && (
                        <FormattedMessage
                          id={'listing-detail.suggestionSellerDisputed'}
                          defaultMessage={`You've accepted an offer on this listing. View the offer to check the status.`}
                        />
                      )}
                      {isSold && (
                        <FormattedMessage
                          id={'listing-detail.sellerSold'}
                          defaultMessage={`You've sold this listing.`}
                        />
                      )}
                      {/* consider the possibility of a withdrawn listing despite a valid offer */}
                      {!isPending &&
                          !isSold &&
                          isWithdrawn && (
                        <FormattedMessage
                          id={'listing-detail.sellerWithdrawn'}
                          defaultMessage={`You've withdrawn this listing.`}
                        />
                      )}
                    </div>
                  )}
                  {!loading &&
                    (userIsBuyer || userIsSeller) &&
                    currentOffer && (
                    <Link
                      to={`/purchases/${currentOffer.id}`}
                      ga-category="listing"
                      ga-label={ `view_${isPending ? 'offer' : 'sale'}` }
                    >
                      {isPending && (
                        <FormattedMessage
                          id={'listing-detail.viewOffer'}
                          defaultMessage={'View Offer'}
                        />
                      )}
                      {isSold && (
                        <FormattedMessage
                          id={'listing-detail.viewSale'}
                          defaultMessage={'View Sale'}
                        />
                      )}
                    </Link>
                  )}
                  {!loading &&
                    userIsSeller &&
                    !currentOffer &&
                    isWithdrawn && (
                    <Link
                      to={`/listings/create`}
                      ga-category="listing"
                      ga-label="create_listing_from_withdrawn"
                    >
                      <FormattedMessage
                        id={'listing-detail.createListing'}
                        defaultMessage={'Create A Listing'}
                      />
                    </Link>
                  )}
                </div>
              )}
              {seller && (
                <UserCard
                  title="seller"
                  listingId={this.props.listingId}
                  userAddress={seller}
                />
              )}
            </div>
            { !this.state.loading && this.state.listingType === 'fractional' &&
              <div className="col-12">
                <Calendar
                  slots={ this.state.slots }
                  offers={ this.state.offers }
                  userType="buyer"
                  viewType={ schemaType === 'housing' ? 'daily' : 'hourly' }
                  onComplete={(slots) => this.handleMakeOffer(false, slots) }
                  step={ 60 }
                />
              </div>
            }
          </div>
          {this.props.withReviews && (
            <div className="row">
              <div className="col-12 col-md-8">
                <hr />
                {this.state.seller && (
                  <Reviews userAddress={this.state.seller} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }
}

const mapStateToProps = ({ app, profile }) => {
  return {
    notificationsHardPermission: app.notificationsHardPermission,
    notificationsSoftPermission: app.notificationsSoftPermission,
    profile,
    pushNotificationsSupported: app.pushNotificationsSupported,
    onMobile: app.onMobile,
    serviceWorkerRegistration: app.serviceWorkerRegistration,
    web3Account: app.web3.account,
    web3Intent: app.web3.intent
  }
}

const mapDispatchToProps = dispatch => ({
  handleNotificationsSubscription: (role, props) => dispatch(handleNotificationsSubscription(role, props)),
  showAlert: msg => dispatch(showAlert(msg)),
  storeWeb3Intent: intent => dispatch(storeWeb3Intent(intent)),
  updateTransaction: (confirmationCount, transactionReceipt) =>
    dispatch(updateTransaction(confirmationCount, transactionReceipt)),
  upsertTransaction: transaction => dispatch(upsertTransaction(transaction))
})

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(injectIntl(ListingsDetail))
