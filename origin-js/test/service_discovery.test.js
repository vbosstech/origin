import chai from 'chai'
import chaiAsPromised from 'chai-as-promised'
import fetchMock from 'fetch-mock'

chai.use(chaiAsPromised)
const expect = chai.expect

import DiscoveryService from '../src/services/discovery-service'

describe('Discovery service', function() {
  const discoveryServerUrl = 'http://test.disco.com'

  describe('getListing', () => {
    it('Should return a listing for an Id that exists', async () => {
      const listingId = '1-000-57'
      const foundListingResponse = {
        status: 200,
        body: {
          'data': {
            'listing': {
              'data': {
                'id': listingId,
              }
            }
          }
        }
      }
      const fetch = fetchMock.sandbox().mock(discoveryServerUrl, foundListingResponse)
      const discoveryService = new DiscoveryService({ discoveryServerUrl, fetch })

      const listing = await discoveryService.getListing(listingId)
      expect(listing.id).to.equal(listingId)
    })

    it('Should throw an exception for an Id that does not exist', async () => {
      const notFoundListingResponse = {
        status: 200,
        body: {
          'data': null
        }
      }
      const fetch = fetchMock.sandbox().mock(discoveryServerUrl, notFoundListingResponse)
      const discoveryService = new DiscoveryService({ discoveryServerUrl, fetch })

      return expect(discoveryService.getListing('1-000-123')).to.eventually.be.rejectedWith(Error)
    })

    it('Should throw an exception if the server returns an error', async () => {
      const fetch = fetchMock.sandbox().mock(discoveryServerUrl, 500)
      const discoveryService = new DiscoveryService({ discoveryServerUrl, fetch })

      return expect(discoveryService.getListing('1-000-57')).to.eventually.be.rejectedWith(Error)
    })
  })

  describe('getListings', () => {
    it('Should return listings', async () => {
      const foundListingResponse = {
        status: 200,
        body: {
          'data': {
            'listings': {
              'nodes': [
                {
                  'data': {
                    'id': '1-000-20',
                    'title': 'Test Listing A',
                  }
                },
                {
                  'data': {
                    'id': '1-000-21',
                    'title': 'Test Listing B',
                  }
                }
              ]
            }
          }
        }
      }
      const fetch = fetchMock.sandbox().mock(discoveryServerUrl, foundListingResponse)
      const discoveryService = new DiscoveryService({ discoveryServerUrl, fetch })

      let listings = await discoveryService.getListings({})
      expect(listings.length).to.equal(2)
      expect(listings[0].id).to.equal('1-000-20')
      expect(listings[1].id).to.equal('1-000-21')
      expect(listings[0].title).to.equal('Test Listing A')
      expect(listings[1].title).to.equal('Test Listing B')

      listings = await discoveryService.getListings({ idsOnly: true })
      expect(listings.length).to.equal(2)
      expect(listings[0]).to.equal('1-000-20')
      expect(listings[1]).to.equal('1-000-21')
    })

    it('Should handle listingsFor option', async () => {
      const foundListingResponse = {
        status: 200,
        body: {
          'data': {
            'user': {
              'listings': {
                'nodes': [
                  {
                    'data': {
                      'id': '1-000-20',
                      'title': 'Test Listing A'
                    },
                    'display': 'featured'
                  },
                  {
                    'data': {
                      'id': '1-000-21',
                      'title': 'Test Listing B'
                    },
                    'display': 'hidden'
                  }
                ]
              }
            }
          }
        }
      }
      const fetch = fetchMock.sandbox().mock(discoveryServerUrl, foundListingResponse)
      const discoveryService = new DiscoveryService({ discoveryServerUrl, fetch })

      let listings = await discoveryService.getListings({ listingsFor: '0xABCD'})
      expect(listings.length).to.equal(2)
      expect(listings[0].id).to.equal('1-000-20')
      expect(listings[1].id).to.equal('1-000-21')
      expect(listings[0].title).to.equal('Test Listing A')
      expect(listings[1].title).to.equal('Test Listing B')
      expect(listings[0].display).to.equal('featured')
      expect(listings[1].display).to.equal('hidden')

      listings = await discoveryService.getListings({ idsOnly: true, listingsFor: '0xABCD' })
      expect(listings.length).to.equal(2)
      expect(listings[0]).to.equal('1-000-20')
      expect(listings[1]).to.equal('1-000-21')
    })

    it('Should handle purchasesFor option', async () => {
      const foundListingResponse = {
        status: 200,
        body: {
          'data': {
            'user': {
              'offers': {
                'nodes': [
                  {
                    'listing': {
                      'data': {
                        'id': '1-000-20',
                        'title': 'Test Listing A'
                      },
                      'display': 'featured'
                    },
                  },
                  {
                    'listing': {
                      'data': {
                        'id': '1-000-21',
                        'title': 'Test Listing B'
                      },
                      'display': 'hidden'
                    }
                  }
                ]
              }
            }
          }
        }
      }
      const fetch = fetchMock.sandbox().mock(discoveryServerUrl, foundListingResponse)
      const discoveryService = new DiscoveryService({ discoveryServerUrl, fetch })

      let listings = await discoveryService.getListings({ purchasesFor: '0xABCD'})
      expect(listings.length).to.equal(2)
      expect(listings[0].id).to.equal('1-000-20')
      expect(listings[1].id).to.equal('1-000-21')
      expect(listings[0].title).to.equal('Test Listing A')
      expect(listings[1].title).to.equal('Test Listing B')
      expect(listings[0].display).to.equal('featured')
      expect(listings[1].display).to.equal('hidden')

      listings = await discoveryService.getListings({ idsOnly: true, purchasesFor: '0xABCD' })
      expect(listings.length).to.equal(2)
      expect(listings[0]).to.equal('1-000-20')
      expect(listings[1]).to.equal('1-000-21')
    })

    describe('Responses with no listings', () => {
      it('general query', async () => {
        const noListingResponse = {
          status: 200,
          body: {
            'data': {
              'listings': {
                'nodes': []
              }
            }
          }
        }
        const fetch = fetchMock.sandbox().mock(discoveryServerUrl, noListingResponse)
        const discoveryService = new DiscoveryService({discoveryServerUrl, fetch})

        let listings = await discoveryService.getListings({})
        expect(listings.length).to.equal(0)

        listings = await discoveryService.getListings({ idsOnly: true })
        expect(listings.length).to.equal(0)
      })

      it('listingsFor option', async () => {
        const noListingResponse = {
          status: 200,
          body: {
            'data': {
              'user': {
                'listings': {
                  'nodes': []
                }
              }
            }
          }
        }
        const fetch = fetchMock.sandbox().mock(discoveryServerUrl, noListingResponse)
        const discoveryService = new DiscoveryService({discoveryServerUrl, fetch})

        let listings = await discoveryService.getListings({ listingsFor: '0xABCD'})
        expect(listings.length).to.equal(0)

        listings = await discoveryService.getListings({ idsOnly: true, listingsFor: '0xABCD' })
        expect(listings.length).to.equal(0)
      })

      it('purchasesFor option', async () => {
        const noListingResponse = {
          status: 200,
          body: {
            'data': {
              'user': {
                'offers': {
                  'nodes': []
                }
              }
            }
          }
        }
        const fetch = fetchMock.sandbox().mock(discoveryServerUrl, noListingResponse)
        const discoveryService = new DiscoveryService({discoveryServerUrl, fetch})

        let listings = await discoveryService.getListings({ purchasesFor: '0xABCD'})
        expect(listings.length).to.equal(0)

        listings = await discoveryService.getListings({ idsOnly: true, purchasesFor: '0xABCD' })
        expect(listings.length).to.equal(0)
      })

    })

    it('Should throw an exception if the server returns an error', async () => {
      const fetch = fetchMock.sandbox().mock(discoveryServerUrl, 500)
      const discoveryService = new DiscoveryService({ discoveryServerUrl, fetch })

      return expect(discoveryService.getListings({})).to.eventually.be.rejectedWith(Error)
    })

  })

  describe('search', () => {
    it('Should return listings', async () => {
      const foundListingResponse = {
        status: 200,
        body: {
          'data': {
            'listings': {
              'nodes': [
                {
                  'id': '1-000-20'
                },
                {
                  'id': '1-000-21'
                }
              ]
            }
          }
        }
      }
      const fetch = fetchMock.sandbox().mock(discoveryServerUrl, foundListingResponse)
      const discoveryService = new DiscoveryService({ discoveryServerUrl, fetch })

      const resp = await discoveryService.search('query', 2, 0, [])
      const listings = resp.data.listings.nodes
      expect(listings.length).to.equal(2)
      expect(listings[0].id).to.equal('1-000-20')
      expect(listings[1].id).to.equal('1-000-21')
    })

    it('Should throw an exception if the server returns an error', async () => {
      const fetch = fetchMock.sandbox().mock(discoveryServerUrl, 500)
      const discoveryService = new DiscoveryService({ discoveryServerUrl, fetch })

      return expect(discoveryService.getListings({})).to.eventually.be.rejectedWith(Error)
    })
  })

  describe('getOffer', () => {
    it('Should return an offer for an Id that exists', async () => {
      const offerId = '1-000-57-1'
      const foundOfferResponse = {
        status: 200,
        body: {
          'data': {
            'offer': {
              'id': offerId,
              'data': {
                'id': '1-000-57-1'
              },
              'listing': {
                'id': '1-000-57'
              }
            }
          }
        }
      }
      const fetch = fetchMock.sandbox().mock(discoveryServerUrl, foundOfferResponse)
      const discoveryService = new DiscoveryService({ discoveryServerUrl, fetch })

      const offer = await discoveryService.getOffer(offerId)
      expect(offer.id).to.equal(offerId)
    })

    it('Should throw an exception for an Id that does not exist', async () => {
      const notFoundOfferResponse = {
        status: 200,
        body: {
          'data': null
        }
      }
      const fetch = fetchMock.sandbox().mock(discoveryServerUrl, notFoundOfferResponse)
      const discoveryService = new DiscoveryService({ discoveryServerUrl, fetch })

      return expect(discoveryService.getOffer('1-000-123')).to.eventually.be.rejectedWith(Error)
    })

    it('Should throw an exception if the server returns an error', async () => {
      const fetch = fetchMock.sandbox().mock(discoveryServerUrl, 500)
      const discoveryService = new DiscoveryService({ discoveryServerUrl, fetch })

      return expect(discoveryService.getOffer('1-000-57')).to.eventually.be.rejectedWith(Error)
    })
  })

  describe('getOffers', () => {
    it('Should return offers', async () => {
      const foundOffersResponse = {
        status: 200,
        body: {
          'data': {
            'offers': {
              'nodes': [
                {
                  'data': {
                    'id': '1-000-57-1'
                  },
                  'listing': {
                    'id': '1-000-57'
                  }
                },
                {
                  'data': {
                    'id': '1-000-57-2'
                  },
                  'listing': {
                    'id': '1-000-57'
                  }
                }
              ]
            }
          }
        }
      }
      const fetch = fetchMock.sandbox().mock(discoveryServerUrl, foundOffersResponse)
      const discoveryService = new DiscoveryService({ discoveryServerUrl, fetch })

      let offers = await discoveryService.getOffers('1-000-57', {})
      expect(offers.length).to.equal(2)
      expect(offers[0].id).to.equal('1-000-57-1')
      expect(offers[1].id).to.equal('1-000-57-2')
      expect(offers[0].listingId).to.equal('1-000-57')
      expect(offers[1].listingId).to.equal('1-000-57')

      offers = await discoveryService.getOffers('1-000-57', { idsOnly: true })
      expect(offers.length).to.equal(2)
      expect(offers[0]).to.equal('1-000-57-1')
      expect(offers[1]).to.equal('1-000-57-2')
    })

    it('Should handle offersFor option', async () => {
      const foundOffersResponse = {
        status: 200,
        body: {
          'data': {
            'offers': {
              'nodes': [
                {
                  'data': {
                    'id': '1-000-57-1'
                  },
                  'listing': {
                    'id': '1-000-57'
                  }
                },
                {
                  'data': {
                    'id': '1-000-57-2'
                  },
                  'listing': {
                    'id': '1-000-57'
                  }
                }
              ]
            }
          }
        }
      }
      const fetch = fetchMock.sandbox().mock(discoveryServerUrl, foundOffersResponse)
      const discoveryService = new DiscoveryService({ discoveryServerUrl, fetch })

      let offers = await discoveryService.getOffers('1-000-57', { for: '0xABCD' })
      expect(offers.length).to.equal(2)
      expect(offers[0].id).to.equal('1-000-57-1')
      expect(offers[1].id).to.equal('1-000-57-2')
      expect(offers[0].listingId).to.equal('1-000-57')
      expect(offers[1].listingId).to.equal('1-000-57')

      offers = await discoveryService.getOffers('1-000-57', { for: '0xABCD', idsOnly: true })
      expect(offers.length).to.equal(2)
      expect(offers[0]).to.equal('1-000-57-1')
      expect(offers[1]).to.equal('1-000-57-2')
    })

    describe('Responses with no offers', () => {
      it('fetch offers for a specific listing', async () => {
        const noOfferResponse = {
          status: 200,
          body: {
            'data': {
              'offers': {
                'nodes': []
              }
            }
          }
        }
        const fetch = fetchMock.sandbox().mock(discoveryServerUrl, noOfferResponse)
        const discoveryService = new DiscoveryService({discoveryServerUrl, fetch})

        let offers = await discoveryService.getOffers('1-000-57', {})
        expect(offers.length).to.equal(0)

        offers = await discoveryService.getOffers('1-000-57', { idsOnly: true })
        expect(offers.length).to.equal(0)
      })

      it('fetch offers for a specific listing with for option', async () => {
        const noOfferResponse = {
          status: 200,
          body: {
            'data': {
              'offers': {
                'nodes': []
              }
            }
          }
        }
        const fetch = fetchMock.sandbox().mock(discoveryServerUrl, noOfferResponse)
        const discoveryService = new DiscoveryService({discoveryServerUrl, fetch})

        let offers = await discoveryService.getOffers('1-000-57', { for: '0xABCD' })
        expect(offers.length).to.equal(0)

        offers = await discoveryService.getOffers('1-000-57', { for: '0xABCD', idsOnly: true })
        expect(offers.length).to.equal(0)
      })

    })

    it('Should throw an exception if the server returns an error', async () => {
      const fetch = fetchMock.sandbox().mock(discoveryServerUrl, 500)
      const discoveryService = new DiscoveryService({ discoveryServerUrl, fetch })

      return expect(discoveryService.getOffers('1-000-57', {})).to.eventually.be.rejectedWith(Error)
    })

  })
})
