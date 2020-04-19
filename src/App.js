import React, { Component } from 'react';
import Select from 'react-select';
import * as moment from 'moment';
import './App.css';
import { withAuthenticator } from 'aws-amplify-react'
import Amplify, { Auth } from 'aws-amplify';
import aws_exports from './aws-exports';
import AWS from 'aws-sdk';
Amplify.configure(aws_exports);

const REGION = 'us-east-2';
const BUCKET = 'covid-chi-1app-prod';

AWS.config.region = REGION;

Amplify.Storage.configure({
  AWSS3: {
    // client upload bucket synced
    // bucket: 'covid-chi-1',

    // devm TEST ENVIRONMENT
    // bucket: 'covid-chi-105443-devm',

    // prod ENVIRONMENT 
    // bucket: 'covid-chi-1app-prod',

    bucket: BUCKET,
    region: REGION
  }
});

class App extends Component {

  constructor(props) {
    super(props);

    this.state = {
      s3: null,

      username: "",
      verified: false,
      loadingCharts: true,
      selectedPatientId: null,
      selectedDateTime: null,
      selectDateTimeDisabled: true,

      patientIdOptions: [],
      possibleCharts: new Map(),
      selectedCharts: "",

      h5ContentLength: null,
      coughChartUrl: "",
      heartRateChartUrl: "",
      physicalActivityChartUrl: "",
      temperatureChartUrl: "",
    };

    this.getUser();
  }

  getUser() {
    Auth.currentAuthenticatedUser().then((cognitoUser) => {
      const userGroups = cognitoUser.signInUserSession.idToken.payload['cognito:groups'];
      let verified = false;
      if(userGroups && userGroups.indexOf('Verified') !== -1) {
        verified = true; 
      }

      Auth.currentCredentials().then((credentials) => {
        const s3 = new AWS.S3({credentials: Auth.essentialCredentials(credentials)});
        this.setState({username: cognitoUser.username, verified: verified, s3: s3}, () => {
          this.getCharts();
        });
      })
      .catch((error) => console.log(error));
    });
  }

  getCharts() {
    let params = {
      Bucket: BUCKET,
      Prefix: "public/",

    };

    const addOption = (charts, patientId, dateTime) => {
      if(!charts.has(patientId)) {
        charts.set(patientId, new Map());
      }
      if(!charts.get(patientId).has(dateTime)) {
        charts.get(patientId).set(dateTime, {});
      }
      return charts.get(patientId).get(dateTime);
    }

    const recursiveList = (params, possibleCharts) => {
      console.log(params)
      this.state.s3.listObjectsV2(params, (err, data) => {
        if(err) {
          console.log(params);
          console.log(err);
          return;
        }

        data.Contents.forEach((s3Obj) => {
          // const chartRegex = /patient_id=([a-zA-Z0-9]+)\/gender=[mfo]\/yyyymmdd=(\d{8})\/.*.png/
          const chartRegex = /public\/([a-zA-Z0-9]+[m|f|M|F])\/sensor_data\/(\d\d)-(\d\d)-(\d\d)-(\d+)_(\d+)_(\d+).*\/(.*.png)/
          const matches = s3Obj.Key.match(chartRegex)
          const publicKey = s3Obj.Key.substring("public/".length);
          if(matches) {
            // MM-DD-YYYY HH:SS 
            let date = moment("20" + matches[2] + "-" + matches[3] + "-" + matches[4] + " " + matches[5] + ":" + matches[6], "YYYYMMDD HH:mm");
            date = date.subtract(6, 'hours')
            const patientId = matches[1];
            const dateTime = date.format('L') + " " + date.format('LT');
            if(matches[8] === 'heart_rate.png') {
              addOption(possibleCharts, patientId, dateTime).heart_rate = publicKey;
            } else if(matches[8] === 'coughs.png') {
              addOption(possibleCharts, patientId, dateTime).cough = publicKey;
            } else if(matches[8] === 'physical_activity.png') {
              addOption(possibleCharts, patientId, dateTime).physical_activity= publicKey;
            } else if(matches[8] === 'temperature.png') {
              addOption(possibleCharts, patientId, dateTime).temperature= publicKey;
            } else {
              console.log("DON'T KNOW WHAT TO DO WITH " + matches[5] + " " + publicKey)
            }
          }

          const h5Regex = /public\/([a-zA-Z0-9]+[m|f|M|F])\/sensor_data\/(\d\d)-(\d\d)-(\d\d)-(\d+)_(\d+)_(\d+).*\/(.*)\/raw.h5/
          const h5Matches = s3Obj.Key.match(h5Regex)
          if(h5Matches) {
            // MM-DD-YYYY HH:SS 
            let date = moment("20" + h5Matches[2] + "-" + h5Matches[3] + "-" + h5Matches[4] + " " + h5Matches[5] + ":" + h5Matches[6], "YYYYMMDD HH:mm");
            date = date.subtract(6, 'hours');
            const patientId = h5Matches[1];
            const dateTime = date.format('L') + " " + date.format('LT');
            addOption(possibleCharts, patientId, dateTime).h5 = publicKey;
          }
        });

        if(data.IsTruncated) {
          params.ContinuationToken = data.NextContinuationToken;
          recursiveList(params, possibleCharts);
        } else {
          // Create a list of options for patients for a day
          const patientIdOptions = [];
          possibleCharts.forEach((value, key) => {
            patientIdOptions.push({value: key, label: key});
          });
          patientIdOptions.sort();

          this.setState({loadingCharts: false, patientIdOptions: patientIdOptions, possibleCharts: possibleCharts});
        }
      });
    };

    const possibleCharts = new Map();
    recursiveList(params, possibleCharts);
  }

  handleSelectedPatientIdChange(option) {
    if(option) {
      const dateTimeOptions = [];
      this.state.possibleCharts.get(option.value).forEach((value, key) => {
        dateTimeOptions.push({value: key, label: key});
      });
      dateTimeOptions.sort();
      dateTimeOptions.reverse();
      this.setState({selectedPatientId: option.value, selectedDateTime: null, selectedCharts: null, dateTimeOptions: dateTimeOptions, selectDateTimeDisabled: false});
    } else {
      this.setState({selectedPatientId: null, selectedDateTime: null, selectedCharts: null, dateTimeOptions: [], selectDateTimeDisabled: true});
    }
  }

  handleSelectedDateTimeChange(option) {
    if(!option) {
      this.setState({selectedCharts: null, selectedDateTime: null, h5ContentLength: null});
      return;
    }

    const selectedCharts = this.state.selectedPatientId + " " + option.value;
    this.setState({selectedCharts: selectedCharts, selectedDateTime: option.value, h5ContentLength: null});
    const chartsToLoad = this.state.possibleCharts.get(this.state.selectedPatientId).get(option.value);
    if(chartsToLoad) {
      console.log(chartsToLoad)
      if(chartsToLoad.cough) {
        Amplify.Storage.get(chartsToLoad.cough)
        .then((result) => {
          console.log("Received authorized link for chart " + result);
          this.setState({coughChartUrl: result})
        })
        .catch(err => console.log(err));
      }
      if(chartsToLoad.heart_rate) {
        Amplify.Storage.get(chartsToLoad.heart_rate)
        .then((result) => {
          console.log("Received authorized link for chart " + result);
          this.setState({heartRateChartUrl: result})
        })
        .catch(err => console.log(err));
      }
      if(chartsToLoad.physical_activity) {
        Amplify.Storage.get(chartsToLoad.physical_activity)
        .then((result) => {
          console.log("Received authorized link for chart " + result);
          this.setState({physicalActivityChartUrl: result})
        })
        .catch(err => console.log(err));
      }
      if(chartsToLoad.temperature) {
        Amplify.Storage.get(chartsToLoad.temperature)
        .then((result) => {
          console.log("Received authorized link for chart " + result);
          this.setState({temperatureChartUrl: result})
        })
        .catch(err => console.log(err));
      }

      if(chartsToLoad.h5) {
        this.state.s3.headObject({Bucket: BUCKET, Key: "public/" + chartsToLoad.h5}, (err, data) => {
          if(err) {
            console.log(err)
          } else {
            const contentLengthInBytes = Number(data.ContentLength);
            if(contentLengthInBytes < 1024) {
              this.setState({h5ContentLength: data.ContentLength + "B"});
            } else if(contentLengthInBytes < 1024 * 1024) {
              this.setState({h5ContentLength: (data.ContentLength / 1024).toFixed(3) + " KB"});
            } else if(contentLengthInBytes < 1024 * 1024 * 1024) {
              this.setState({h5ContentLength: (data.ContentLength / (1024 * 1024)).toFixed(3) + " MB"});
            } else {
              this.setState({h5ContentLength: (data.ContentLength / (1024 * 1024 * 1024)).toFixed(3) + " GB"});
            }
          }
        });
      }
    }
  }

  handleDownloadRaw(event) {
    const key = this.state.possibleCharts.get(this.state.selectedPatientId).get(this.state.selectedDateTime);
    if(key && key.h5) {
      Amplify.Storage.get(key.h5)
        .then((result) => {
          let a = document.createElement('a');
          a.href = result;
          a.download = this.state.selectedCharts.replace(/ /g,"_").replace(/\//g,"_") + ".h5";
          a.target = "_blank";
          a.click();
        })
        .catch((error) => console.log(error));
    }
  }

  render() {
    const UnverifiedApp = () => (
      <div>
        <header className="App-header">
          <p className="App-unverified">Reach out to your Rogers Covid Project support contact.</p>
          <p className="App-unverified">Your account must be manually approved prior to accessing data.</p>
        </header>
      </div>
    );

    const Chart = ({label, url}) => (
      <div>
        <p>{label}</p>
        <img src={url} alt="logo" className="App-chart"/>
      </div>
    )

    const ActiveCharts = ({label, charts}) => {
      if(charts) {
        return (
          <div>
            {charts.cough ? <Chart label={"Cough: " + label} url={this.state.coughChartUrl} /> : <div></div>} 
            {charts.heart_rate ? <Chart label={"Heart Rate: " + label} url={this.state.heartRateChartUrl} /> : <div></div>} 
            {charts.physical_activity ? <Chart label={"Physical Activity: " + label} url={this.state.physicalActivityChartUrl} /> : <div></div>} 
            {charts.temperature ? <Chart label={"Temperature: " + label} url={this.state.temperatureChartUrl} /> : <div></div>} 
          </div>
        );
      } else {
        return <div></div>
      }
    }

    const LoadingBanner = () => {
      if(this.state.loadingCharts) {
        return (
          <p className="App-verified">Loading ...</p>
        );
      } else {
        return (
          <p className="App-verified">Filter by Patient Id and Date Time to view charts or download data.</p>
        )
      }
    }

    const DownloadData = () => {
      if(this.state.selectedPatientId && this.state.selectedDateTime && this.state.h5ContentLength) {
        return (
            <div>
              <p className="App-verified">Unprocessed data may be downloaded as HDF.</p>

              <button onClick={this.handleDownloadRaw.bind(this)} style={{fontSize: 18}}>
                Download {this.state.h5ContentLength} (HDF5)
              </button>
            </div>
          );
      } else if(this.state.selectedPatientId && this.state.selectedDateTime) {
        return (
            <div>
              <p className="App-verified">Unprocessed HDF data not available.</p>
            </div>
          );
      } else {
        return <div />;
      }
    }

    const VerifiedApp = () => (
      <div>
        <header className="App-header">
          <LoadingBanner />

          <div className="App-filter">
            <div className="App-filterInfo">
              <p className="App-verified">Select a Patient Id.</p>

              <div className="App-select">
                <Select
                  className="basic-single"
                  classNamePrefix="select"
                  isDisabled={false}
                  isLoading={this.state.loadingCharts}
                  isClearable={false}
                  isRtl={false}
                  isSearchable={true}
                  name="patientId"
                  options={this.state.patientIdOptions}
                  value={{label: this.state.selectedPatientId}}
                  onChange={this.handleSelectedPatientIdChange.bind(this)}
                />
              </div>
            </div>

            <div className="App-filterInfo">
              <p className="App-verified">Select a Date and Time.</p>

              <div className="App-select">
                <Select
                  className="basic-single"
                  classNamePrefix="select"
                  isDisabled={this.state.selectDateTimeDisabled}
                  isLoading={this.state.loadingCharts}
                  isClearable={true}
                  isRtl={false}
                  isSearchable={true}
                  name="dateTime"
                  options={this.state.dateTimeOptions}
                  value={{label: this.state.selectedDateTime}}
                  onChange={this.handleSelectedDateTimeChange.bind(this)}
                />
              </div>
            </div>
          </div>

          <DownloadData />

          <ActiveCharts label={this.state.selectedPatientId + " " + this.state.selectedDateTime} charts={this.state.selectedPatientId && this.state.selectedDateTime ? this.state.possibleCharts.get(this.state.selectedPatientId).get(this.state.selectedDateTime) : null} />
        </header>
     </div>
    );


    return (
      <div className="App">
        {this.state.verified ? <VerifiedApp /> : <UnverifiedApp />}
      </div>
    );
  }
}

export default withAuthenticator(App, true);
