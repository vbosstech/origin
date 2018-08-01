import React, { Component } from 'react'
import { connect } from 'react-redux'
import { FormattedMessage } from 'react-intl'

import { storeWeb3Intent } from 'actions/App'

import MyPurchaseCard from 'components/my-purchase-card'

import origin from '../services/origin'

class MyPurchases extends Component {
  constructor(props) {
    super(props)

    this.state = { filter: 'pending', purchases: [], loading: true }
  }

  componentDidMount() {
    if(!web3.givenProvider || !this.props.web3Account) {
      this.props.storeWeb3Intent('view your purchases')
    }
  }

  async componentWillMount() {
    const listingIds = await origin.listings.allIds()
    const purchasesByListing = await Promise.all(listingIds.map(listingId => {
      return origin.listings.getPurchases(listingId)
    }))
    const withListingIds = purchasesByListing.map((purchases, listingId) => {
      return purchases.map(purchase => {
        purchase.listingId = listingId
        return purchase
      })
    })
    const purchasesFlattened = [].concat.apply([], withListingIds)
    this.setState({ purchases: purchasesFlattened })
    this.setState({ loading: false })
  }

  render() {
    const { web3Account } = this.props
    const { filter, loading, purchases } = this.state
    const buyerPurchases = purchases.filter((purchase) => {
      return purchase.buyerAddress === web3Account
    })
    const filteredPurchases = (() => {
      switch(filter) {
        case 'pending':
          return buyerPurchases.filter(p => p.stage !== 'SELLER_FINALIZED')
        case 'complete':
          return buyerPurchases.filter(p => p.stage === 'SELLER_FINALIZED')
        default:
          return buyerPurchases
      }
    })()

    return (
      <div className="my-purchases-wrapper">
        <div className="container">
          {loading &&
            <div className="row">
              <div className="col-12 text-center">
                <h1>
                  <FormattedMessage
                    id={ 'my-purchases.loading' }
                    defaultMessage={ 'Loading...' }
                  />
                </h1>
              </div>
            </div>
          }
          {!loading && !purchases.length &&
            <div className="row">
              <div className="col-12 text-center">
                <img src="images/empty-listings-graphic.svg"></img>
                <h1>
                  <FormattedMessage
                    id={ 'my-purchases.no-purchases' }
                    defaultMessage={ 'You haven’t bought anything yet.'}
                  />
                </h1>
                <p>
                  <FormattedMessage
                    id={ 'my-purchases.view-listings' }
                    defaultMessage={ 'Click below to view all listings.' }
                  />
                </p>
                <br />
                <a href="/" className="btn btn-lrg btn-primary">Browse Listings</a>
              </div>
            </div>
          }
          {!loading && !!purchases.length &&
            <div className="row">
              <div className="col-12">
                <div className="row">
                  <div className="col-12">
                    <h1>
                      <FormattedMessage
                        id={ 'my-purchases.myPurchasesHeading' }
                        defaultMessage={ 'My Purchases' }
                      />
                    </h1>
                  </div>
                </div>
                <div className="row">
                  <div className="col-12 col-md-3">
                    <div className="filters list-group flex-row flex-md-column">
                      <a className={`list-group-item list-group-item-action${filter === 'pending' ? ' active' : ''}`}
                        onClick={() => this.setState({ filter: 'pending' })}>
                        <FormattedMessage
                          id={ 'my-purchases.pending' }
                          defaultMessage={ 'Pending' }
                        />
                      </a>
                      <a className={`list-group-item list-group-item-action${filter === 'complete' ? ' active' : ''}`}
                        onClick={() => this.setState({ filter: 'complete' })}>
                        <FormattedMessage
                          id={ 'my-purchases.complete' }
                          defaultMessage={ 'Complete' }
                        />
                      </a>
                      <a className={`list-group-item list-group-item-action${filter === 'all' ? ' active' : ''}`}
                        onClick={() => this.setState({ filter: 'all' })}>
                        <FormattedMessage
                          id={ 'my-purchases.all' }
                          defaultMessage={ 'All' }
                        />
                      </a>
                    </div>
                  </div>
                  <div className="col-12 col-md-9">
                    <div className="my-listings-list">
                      {filteredPurchases.map((purchase, purchaseId) => <MyPurchaseCard key={`my-purchase-${purchaseId}`} purchase={purchase} purchaseId={purchaseId} listingId={purchase.listingId} />)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }
        </div>
      </div>
    )
  }
}

const mapStateToProps = state => {
  return {
    web3Account: state.app.web3.account,
    web3Intent: state.app.web3.intent,
  }
}

const mapDispatchToProps = dispatch => ({
  storeWeb3Intent: intent => dispatch(storeWeb3Intent(intent)),
})

export default connect(mapStateToProps, mapDispatchToProps)(MyPurchases)
