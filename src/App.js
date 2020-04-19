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
      patientIdOptions: [],
      possibleCharts: new Map(),
      selectedCharts: "",

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
            const label = matches[1] + " " + date.format('L') + " " + date.format('LT')
            if(matches[8] === 'heart_rate.png') {
              if(possibleCharts.has(label)) {
                possibleCharts.get(label).heart_rate = publicKey;
              } else {
                possibleCharts.set(label, {heart_rate: publicKey});
              }
            } else if(matches[8] === 'coughs.png') {
              if(possibleCharts.has(label)) {
                possibleCharts.get(label).cough = publicKey;
              } else {
                possibleCharts.set(label, {cough: publicKey});
              }
            } else if(matches[8] === 'physical_activity.png') {
              if(possibleCharts.has(label)) {
                possibleCharts.get(label).physical_activity = publicKey;
              } else {
                possibleCharts.set(label, {physical_activity: publicKey});
              }
            } else if(matches[8] === 'temperature.png') {
              if(possibleCharts.has(label)) {
                possibleCharts.get(label).temperature = publicKey;
              } else {
                possibleCharts.set(label, {temperature: publicKey});
              }
            } else {
              console.log("DON'T KNOW WHAT TO DO WITH " + matches[5] + " " + publicKey)
            }
          }

          const h5Regex = /([a-zA-Z0-9]+[m|f|M|F])\/sensor_data\/(\d\d)-(\d\d)-(\d\d)-(\d+)_(\d+)_(\d+).*\/(.*)\/raw.h5/
          const h5Matches = s3Obj.Key.match(h5Regex)
          if(h5Matches) {
            // MM-DD-YYYY HH:SS 
            let date = moment("20" + h5Matches[2] + "-" + h5Matches[3] + "-" + h5Matches[4] + " " + h5Matches[5] + ":" + h5Matches[6], "YYYYMMDD HH:mm");
            date = date.subtract(6, 'hours')
            const label = h5Matches[1] + " " + date.format('L') + " " + date.format('LT');
            if(possibleCharts.has(label)) {
              possibleCharts.get(label).h5 = publicKey;  
            } else {
              possibleCharts.set(label, {h5: publicKey})
            }
          }
        });


        console.log(data)
        if(data.IsTruncated) {
          params.ContinuationToken = data.NextContinuationToken;
          recursiveList(params, possibleCharts);
        } else {
          // Create a list of options for patients for a day
          const patientIdOptions = [];
          possibleCharts.forEach((value, key) => {
            patientIdOptions.push({value: key, label: key});
          });

          this.setState({loadingCharts: false, patientIdOptions: patientIdOptions, possibleCharts: possibleCharts}, () => {
            if(this.state.patientIdOptions.length > 0) {
              this.handleSelectedChartsChange(this.state.patientIdOptions[0])
            } else {
              console.log("NO PATIENT ID OPTIONS FOUND !!!");
            }
          });
        }
      });
    };

    const possibleCharts = new Map();
    recursiveList(params, possibleCharts);
    // Amplify.Storage.list('')
    //   .then(result => {
    //     // Find all of the charts for a patient for a day
    //     const possibleCharts = new Map();
    //     result.forEach(element => {
    //       // const chartRegex = /patient_id=([a-zA-Z0-9]+)\/gender=[mfo]\/yyyymmdd=(\d{8})\/.*.png/
    //       const chartRegex = /([a-zA-Z0-9]+[m|f|M|F])\/sensor_data\/(\d\d)-(\d\d)-(\d\d)-(\d+)_(\d+)_(\d+).*\/(.*.png)/
    //       const matches = element.key.match(chartRegex)
    //       if(matches) {
    //         // MM-DD-YYYY HH:SS 
    //         let date = moment("20" + matches[2] + "-" + matches[3] + "-" + matches[4] + " " + matches[5] + ":" + matches[6], "YYYYMMDD HH:mm");
    //         date = date.subtract(6, 'hours')
    //         const label = matches[1] + " " + date.format('L') + " " + date.format('LT')
    //         if(matches[8] === 'heart_rate.png') {
    //           if(possibleCharts.has(label)) {
    //             possibleCharts.get(label).heart_rate = element.key;
    //           } else {
    //             possibleCharts.set(label, {heart_rate: element.key});
    //           }
    //         } else if(matches[8] === 'coughs.png') {
    //           if(possibleCharts.has(label)) {
    //             possibleCharts.get(label).cough = element.key;
    //           } else {
    //             possibleCharts.set(label, {cough: element.key});
    //           }
    //         } else if(matches[8] === 'physical_activity.png') {
    //           if(possibleCharts.has(label)) {
    //             possibleCharts.get(label).physical_activity = element.key;
    //           } else {
    //             possibleCharts.set(label, {physical_activity: element.key});
    //           }
    //         } else if(matches[8] === 'temperature.png') {
    //           if(possibleCharts.has(label)) {
    //             possibleCharts.get(label).temperature = element.key;
    //           } else {
    //             possibleCharts.set(label, {temperature: element.key});
    //           }
    //         } else {
    //           console.log("DON'T KNOW WHAT TO DO WITH " + matches[5] + " " + element.key)
    //         }
    //       }

    //       const h5Regex = /([a-zA-Z0-9]+[m|f|M|F])\/sensor_data\/(\d\d)-(\d\d)-(\d\d)-(\d+)_(\d+)_(\d+).*\/(.*)\/raw.h5/
    //       const h5Matches = element.key.match(h5Regex)
    //       if(h5Matches) {
    //         // MM-DD-YYYY HH:SS 
    //         let date = moment("20" + h5Matches[2] + "-" + h5Matches[3] + "-" + h5Matches[4] + " " + h5Matches[5] + ":" + h5Matches[6], "YYYYMMDD HH:mm");
    //         date = date.subtract(6, 'hours')
    //         const label = h5Matches[1] + " " + date.format('L') + " " + date.format('LT');
    //         if(possibleCharts.has(label)) {
    //           possibleCharts.get(label).h5 = element.key;  
    //         } else {
    //           possibleCharts.set(label, {h5: element.key})
    //         }
    //       }
    //     });

    //     // Create a list of options for patients for a day
    //     const patientIdOptions = [];
    //     possibleCharts.forEach((value, key) => {
    //       patientIdOptions.push({value: key, label: key});
    //     });

    //     this.setState({loadingCharts: false, patientIdOptions: patientIdOptions, possibleCharts: possibleCharts}, () => {
    //       if(this.state.patientIdOptions.length > 0) {
    //         this.handleSelectedChartsChange(this.state.patientIdOptions[0])
    //       }
    //     });
    //   })
    //   .catch(err => console.log(err));
  }

  handleSelectedChartsChange(option) {
    this.setState({selectedCharts: option.value});
    const chartsToLoad = this.state.possibleCharts.get(option.value);
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
    }
  }

  handleDownloadRaw(event) {
    const key = this.state.possibleCharts.get(this.state.selectedCharts);
    if(key && key.h5) {
      Amplify.Storage.get(key.h5)
        .then((result) => {
          console.log(result);
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

    const DownloadData = () => {
      if(this.state.selectedCharts && this.state.possibleCharts.get(this.state.selectedCharts).h5) {
        return (
            <div>
              <p className="App-verified">Download unprocessed HDF data.</p>

              <button onClick={this.handleDownloadRaw.bind(this)}>
                Download HDF data
              </button>
            </div>
          );
      } else {
        return (
            <div>
              <p className="App-verified">Unprocessed HDF data not available.</p>
            </div>
          );
      }
    }

    const VerifiedApp = () => (
      <div>
        <header className="App-header">
          <div className="App-filter">
            <div className="App-filterInfo">
              <p className="App-verified">Select a chart.</p>
              <p className="App-verified">Filter by patient id and date.</p>

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
                  value={{label: this.state.selectedCharts}}
                  onChange={this.handleSelectedChartsChange.bind(this)}
                />
              </div>

              <DownloadData />
            </div>
          </div>

          <ActiveCharts label={this.state.selectedCharts} charts={this.state.possibleCharts.get(this.state.selectedCharts)} />
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
